/****************************************************************************
 Copyright (c) 2017-2018 Xiamen Yaji Software Co., Ltd.

 http://www.cocos.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated engine source code (the "Software"), a limited,
 worldwide, royalty-free, non-assignable, revocable and non-exclusive license
 to use Cocos Creator solely to develop games on your target platforms. You shall
 not use Cocos Creator software for developing other software or tools that's
 used for developing games. You are not granted to publish, distribute,
 sublicense, and/or sell copies of Cocos Creator.

 The software or tools in this License Agreement are licensed, not sold.
 Xiamen Yaji Software Co., Ltd. reserves all rights not expressly granted to you.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 ****************************************************************************/

import {
    ccclass,
    executeInEditMode,
    executionOrder,
    property,
    requireComponent,
} from '../../../core/data/class-decorator';
import { EventType } from '../../../core/platform';
import { Color } from '../../../core/value-types';
import { ccenum } from '../../../core/value-types/enum';
import { GFXBlendFactor } from '../../../gfx/define';
import { RenderData } from '../../../renderer/ui/renderData';
import { UI } from '../../../renderer/ui/ui';
import { Material } from '../../assets';
import { RenderableComponent } from '../../framework/renderable-component';
import { IAssembler, IAssemblerManager } from '../assembler/assembler';
import { CanvasComponent } from './canvas-component';
import { UIComponent } from './ui-component';
import { UITransformComponent } from './ui-transfrom-component';

// hack
ccenum(GFXBlendFactor);

/**
 * @zh
 * 实例后的材质的着色器属性类型
 */
export enum InstanceMaterialType {
    /**
     * @zh
     * 着色器只带颜色属性。
     */
    ADDCOLOR = 0,

    /**
     * @zh
     * 着色器带颜色和贴图属性。
     */
    ADDCOLORANDTEXTURE = 1,
}

/**
 * @zh
 * 所有支持渲染的 UI 组件的基类
 */
@ccclass('cc.UIRenderComponent')
@executionOrder(110)
@requireComponent(UITransformComponent)
@executeInEditMode
export class UIRenderComponent extends UIComponent {

    /**
     * @zh
     * 指定原图的混合模式，这会克隆一个新的材质对象，注意这带来的。
     *
     * @param value 原图混合模式。
     * @example
     * ```ts
     * sprite.srcBlendFactor = macro.BlendFactor.ONE;
     * ```
     */
    @property({
        type: GFXBlendFactor,
        displayOrder: 0,
    })
    get srcBlendFactor () {
        return this._srcBlendFactor;
    }

    set srcBlendFactor (value: GFXBlendFactor) {
        if (this._srcBlendFactor === value) {
            return;
        }

        this._srcBlendFactor = value;
        this._updateBlendFunc();
    }

    /**
     * @zh
     * 指定目标的混合模式。
     *
     * @param value 目标混合模式。
     * @example
     * ```ts
     * sprite.dstBlendFactor = GFXBlendFactor.ONE;
     * ```
     */
    @property({
        type: GFXBlendFactor,
        displayOrder: 1,
    })
    get dstBlendFactor () {
        return this._dstBlendFactor;
    }

    set dstBlendFactor (value: GFXBlendFactor) {
        if (this._dstBlendFactor === value) {
            return;
        }

        this._dstBlendFactor = value;
        this._updateBlendFunc();
    }

    /**
     * @zh
     * 渲染颜色。
     *
     * @param value 渲染颜色。
     */
    @property({
        displayOrder: 2,
    })
    get color () {
        return this._color;
    }

    set color (value) {
        if (this._color === value) {
            return;
        }

        this._color = value;
        this.markForUpdateRenderData();
    }

    /**
     * @zh
     * 渲染使用材质，实际使用材质是实例后材质。
     *
     * @param value 源材质。
     */
    @property({
        type: Material,
        displayOrder: 3,
    })
    get sharedMaterial () {
        return this._sharedMaterial;
    }

    set sharedMaterial (value) {
        if (this._sharedMaterial === value) {
            return;
        }

        this._sharedMaterial = value;
        if (this._instanceMaterial) {
            this._instanceMaterial();
        }
    }

    get material () {
        if (!this._material){
            if (this._instanceMaterial) {
                this._instanceMaterial();
            }
        }

        return this._material;
    }

    get renderData () {
        return this._renderData;
    }

    public static BlendState = GFXBlendFactor;
    public static Assembler: IAssemblerManager | null = null;
    public static PostAssembler: IAssemblerManager | null = null;

    @property
    protected _srcBlendFactor = GFXBlendFactor.SRC_ALPHA;
    @property
    protected _dstBlendFactor = GFXBlendFactor.ONE_MINUS_SRC_ALPHA;
    @property
    protected _color: Color = Color.WHITE;
    @property
    protected _sharedMaterial: Material | null = null;

    protected _assembler: IAssembler | null = null;
    protected _postAssembler: IAssembler | null = null;
    protected _renderDataPoolID = -1;
    protected _renderData: RenderData | null = null;
    protected _renderDataDirty = false;
    // 特殊渲染标记，在可渲染情况下，因为自身某个原因不给予渲染
    protected _renderPermit = true;
    protected _material: Material | null = null;
    protected _instanceMaterialType = InstanceMaterialType.ADDCOLORANDTEXTURE;
    protected _blendTemplate = {
        blendState: {
            targets: [
                {
                    blendSrc: GFXBlendFactor.SRC_ALPHA,
                    blendDst: GFXBlendFactor.ONE_MINUS_SRC_ALPHA,
                },
            ],
        },
        depthStencilState: {},
        rasterizerState: {},
    };

    public __preload (){
        this._instanceMaterial();
        if (this._flushAssembler){
            this._flushAssembler();
        }
    }

    public onEnable () {
        let parent = this.node;
        // 获取被渲染相机的 visibility
        while (parent) {
            if (parent) {
                const canvasComp = parent.getComponent(CanvasComponent);
                if (canvasComp) {
                    this._visibility = canvasComp.visibility;
                    break;
                }
            }

            // @ts-ignore
            parent = parent.parent;
        }

        this.node.on(EventType.ANCHOR_CHANGED, this._nodeStateChange, this);
        this.node.on(EventType.TRANSFORM_CHANGED, this._nodeStateChange, this);
        this.node.on(EventType.SIZE_CHANGED, this._nodeStateChange, this);
        // if (this.node._renderComponent) {
        //     this.node._renderComponent.enabled = false;
        // }
        // this.node._renderComponent = this;
        // this.node._renderFlag |= RenderFlow.FLAG_RENDER | RenderFlow.FLAG_UPDATE_RENDER_DATA | RenderFlow.FLAG_COLOR;
        this._renderDataDirty = true;
    }

    public onDisable () {
        this._visibility = -1;
        // this.node._renderComponent = null;
        // this.disableRender();
        this.node.off(EventType.ANCHOR_CHANGED, this._nodeStateChange, this);
        this.node.off(EventType.TRANSFORM_CHANGED, this._nodeStateChange, this);
        this.node.off(EventType.SIZE_CHANGED, this._nodeStateChange, this);
    }

    public onDestroy () {
        // for (let i = 0, l = this._allocedDatas.length; i < l; i++) {
        //     RenderData.free(this._allocedDatas[i]);
        // }
        // this._allocedDatas.length = 0;
        this.destroyRenderData();
        if (this._material){
            this._material.destroy();
            cc.director.root.ui._removeUIMaterial(this._material.hash);
        }

        this._updateMaterial(null);
        this._renderData = null;
    }

    /**
     * @zh
     * 标记当前组件的渲染数据为已修改状态，这样渲染数据才会重新计算。
     *
     * @param enable 是否标记为已修改。
     */
    public markForUpdateRenderData (enable: boolean = true) {
        if (enable && this._canRender()) {
            const renderData = this._renderData;
            if (renderData) {
                renderData.uvDirty = true;
                renderData.vertDirty = true;
            }

            this._renderDataDirty = enable;
        }
        else if (!enable) {
            this._renderDataDirty = enable;
        }
    }

    /**
     * @zh
     * 请求渲染数据。
     *
     * @return 渲染数据 RenderData。
     */
    public requestRenderData () {
        const data = RenderData.add();
        // this._allocedDatas.push(data);
        this._renderData = data.data;
        this._renderDataPoolID = data.pooID;
        return this._renderData;
    }

    /**
     * @zh
     * 渲染数据销毁。
     */
    public destroyRenderData () {
        if (this._renderDataPoolID === -1) {
            return;
        }

        RenderData.remove(this._renderDataPoolID);
        this._renderDataPoolID = -1;
        this._renderData = null;
    }

    /**
     * @zh
     * 每个渲染组件都由此接口决定是否渲染以及渲染状态的更新。
     *
     * @param render 数据处理中转站。
     */
    public updateAssembler (render: UI) {
        if (!this._canRender()) {
            return false;
        }

        if (this.node.hasChanged && !this._renderDataDirty) {
            this.markForUpdateRenderData();
        }

        this._checkAndUpdateRenderData();
        return true;
    }

    protected _checkAndUpdateRenderData (){
        if (this._renderDataDirty) {
            this._assembler!.updateRenderData!(this);
            this._renderDataDirty = false;
        }
    }

    protected _canRender () {
        return this.material !== null && this._renderPermit;
    }

    protected _updateColor () {
        const material = this._material;
        if (material) {
            material.setProperty('color', this._color);
        }
    }

    protected _updateMaterial (material: Material | null) {
        this._material = material;

        this._updateBlendFunc();
    }

    protected _updateBlendFunc () {
        if (!this._material) {
            return;
        }

        const target = this._blendTemplate.blendState.targets[0];
        if (target.blendDst !== this._dstBlendFactor || target.blendSrc !== this._srcBlendFactor) {
            target.blendDst = this._dstBlendFactor;
            target.blendSrc = this._srcBlendFactor;
            this._blendTemplate.depthStencilState = this._material.passes[0].depthStencilState;
            this._blendTemplate.rasterizerState = this._material.passes[0].rasterizerState;
            this._material.overridePipelineStates(this._blendTemplate, 0);
        }
    }

    // pos, rot, scale changed
    protected _nodeStateChange (){
        if (this._renderData) {
            this.markForUpdateRenderData();
        }

        for (const child of this.node.children) {
            const renderComp = child.getComponent(UIRenderComponent);
            if (renderComp) {
                renderComp.markForUpdateRenderData();
            }
        }
    }

    protected _instanceMaterial () {
        let mat: Material | null = null;
        if (this._sharedMaterial) {
            mat = Material.getInstantiatedMaterial(this._sharedMaterial, new RenderableComponent(), CC_EDITOR ? true : false);
        } else {
            switch (this._instanceMaterialType){
                case InstanceMaterialType.ADDCOLOR:
                    mat = Material.getInstantiatedMaterial(cc.builtinResMgr.get('ui-base-material'), new RenderableComponent(), CC_EDITOR ? true : false);
                    break;
                case InstanceMaterialType.ADDCOLORANDTEXTURE:
                    mat = Material.getInstantiatedMaterial(cc.builtinResMgr.get('ui-sprite-material'), new RenderableComponent(), CC_EDITOR ? true : false);
                    break;
            }
        }

        this._updateMaterial(mat);
    }

    protected _flushAssembler? (): void;
}

cc.UIRenderComponent = UIRenderComponent;
