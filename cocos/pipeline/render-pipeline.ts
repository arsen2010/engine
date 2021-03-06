import { intersect } from '../3d/geom-utils';
import { Root } from '../core/root';
import { Mat4, Vec3 } from '../core/value-types';
import { mat4, vec3 } from '../core/vmath';
import { GFXBuffer } from '../gfx/buffer';
import {
    GFXBindingType,
    GFXBufferUsageBit,
    GFXFormat,
    GFXFormatInfos,
    GFXLoadOp,
    GFXMemoryUsageBit,
    GFXStoreOp,
    GFXTextureLayout,
    GFXTextureType,
    GFXTextureUsageBit,
    GFXTextureViewType} from '../gfx/define';
import { GFXDevice, GFXFeature, GFXAPI } from '../gfx/device';
import { GFXFramebuffer } from '../gfx/framebuffer';
import { GFXInputAssembler, IGFXAttribute } from '../gfx/input-assembler';
import { GFXRenderPass } from '../gfx/render-pass';
import { GFXTexture } from '../gfx/texture';
import { GFXTextureView } from '../gfx/texture-view';
import { Camera, Model } from '../renderer';
import { IDefineMap } from '../renderer/core/pass';
import { programLib } from '../renderer/core/program-lib';
import { IRenderObject, UBOGlobal, UBOShadow } from './define';
import { IInternalBindingInst } from './define';
import { IRenderFlowInfo, RenderFlow } from './render-flow';
import { RenderView } from './render-view';

const _vec4Array = new Float32Array(4);
const _vec4ArrayZero = [0.0, 0.0, 0.0, 0.0];
const _mat4Array = new Float32Array(16);
const _outMat = new Mat4();
const _v3tmp = new Vec3();

export interface IRenderPipelineInfo {
    enablePostProcess?: boolean;
    enableHDR?: boolean;
    enableMSAA?: boolean;
    enableSMAA?: boolean;
}

export abstract class RenderPipeline {

    public get root (): Root {
        return this._root;
    }

    public get device (): GFXDevice {
        return this._device;
    }

    public get name (): string {
        return this._name;
    }

    public get renderObjects (): IRenderObject[] {
        return this._renderObjects;
    }

    public get flows (): RenderFlow[] {
        return this._flows;
    }

    public get usePostProcess (): boolean {
        return this._usePostProcess;
    }

    public get isHDRSupported (): boolean {
        return this._isHDRSupported;
    }

    public get isHDR (): boolean {
        return this._isHDR;
    }

    public get shadingScale (): number {
        return this._shadingScale;
    }

    public set lightMeterScale (scale: number) {
        this._lightMeterScale = scale;
    }

    public get lightMeterScale (): number {
        return this._lightMeterScale;
    }

    public get depthStencilTexView (): GFXTextureView {
        return this._depthStencilTexView!;
    }

    public get curShadingTexView (): GFXTextureView {
        return this._shadingTexViews[this._curIdx];
    }

    public get prevShadingTexView (): GFXTextureView {
        return this._shadingTexViews[this._prevIdx];
    }

    public get curShadingFBO (): GFXFramebuffer {
        return this._shadingFBOs[this._curIdx];
    }

    public get prevShadingFBO (): GFXFramebuffer {
        return this._shadingFBOs[this._prevIdx];
    }

    public get msaaShadingFBO (): GFXFramebuffer {
        return this._msaaShadingFBO!;
    }

    public get useMSAA (): boolean {
        return this._useMSAA;
    }

    public get useSMAA (): boolean {
        return this._useSMAA;
    }

    public get smaaEdgeTexView (): GFXTextureView {
        return this._smaaEdgeTexView!;
    }

    public get smaaEdgeFBO (): GFXFramebuffer {
        return this._smaaEdgeFBO!;
    }

    public get smaaBlendTexView (): GFXTextureView {
        return this._smaaBlendTexView!;
    }

    public get smaaBlendFBO (): GFXFramebuffer {
        return this._smaaBlendFBO!;
    }

    public get quadIA (): GFXInputAssembler {
        return this._quadIA!;
    }

    public get globalBindings (): Map<string, IInternalBindingInst> {
        return this._globalBindings;
    }

    public get defaultTexture (): GFXTexture {
        return this._defaultTex!;
    }

    public get fpScale (): number {
        return this._fpScale;
    }

    public get fpScaleInv (): number {
        return this._fpScaleInv;
    }

    public get macros (): IDefineMap {
        return this._macros;
    }

    public get defaultGlobalUBOData (): Float32Array {
        return this._defaultUboGlobal!.view;
    }

    protected _root: Root;
    protected _device: GFXDevice;
    protected _name: string = 'BasePipeline';
    protected _renderObjects: IRenderObject[] = [];
    protected _renderPasses: Map<number, GFXRenderPass> = new Map();
    protected _flows: RenderFlow[] = [];
    protected _isHDRSupported: boolean = false;
    protected _isHDR: boolean = false;
    protected _lightMeterScale: number = 10000.0;
    protected _shadingPass: GFXRenderPass | null = null;
    protected _fboCount: number = 1;
    protected _msaaShadingTex: GFXTexture | null = null;
    protected _msaaShadingTexView: GFXTextureView | null = null;
    protected _msaaDepthStencilTex: GFXTexture | null = null;
    protected _msaaDepthStencilTexView: GFXTextureView | null = null;
    protected _msaaShadingFBO: GFXFramebuffer | null = null;

    protected _colorFmt: GFXFormat = GFXFormat.UNKNOWN;
    protected _depthStencilFmt: GFXFormat = GFXFormat.UNKNOWN;
    protected _shadingTextures: GFXTexture[] = [];
    protected _shadingTexViews: GFXTextureView[] = [];
    protected _depthStencilTex: GFXTexture | null = null;
    protected _depthStencilTexView: GFXTextureView | null = null;
    protected _shadingFBOs: GFXFramebuffer[] = [];
    protected _shadingWidth: number = 0.0;
    protected _shadingHeight: number = 0.0;
    protected _shadingScale: number = 1.0;
    protected _curIdx: number = 0;
    protected _prevIdx: number = 1;
    protected _usePostProcess: boolean = false;
    protected _useMSAA: boolean = false;
    protected _useSMAA: boolean = false;
    protected _smaaPass: GFXRenderPass | null = null;
    protected _smaaEdgeFBO: GFXFramebuffer | null = null;
    protected _smaaEdgeTex: GFXTexture | null = null;
    protected _smaaEdgeTexView: GFXTextureView | null = null;
    protected _smaaBlendFBO: GFXFramebuffer | null = null;
    protected _smaaBlendTex: GFXTexture | null = null;
    protected _smaaBlendTexView: GFXTextureView | null = null;
    protected _quadVB: GFXBuffer | null = null;
    protected _quadIB: GFXBuffer | null = null;
    protected _quadIA: GFXInputAssembler | null = null;
    protected _defaultUboGlobal: UBOGlobal = new UBOGlobal();
    protected _globalBindings: Map<string, IInternalBindingInst> = new Map<string, IInternalBindingInst>();
    protected _defaultTex: GFXTexture | null = null;
    protected _defaultTexView: GFXTextureView | null = null;
    protected _fpScale: number = 1.0 / 1024.0;
    protected _fpScaleInv: number = 1024.0;
    protected _macros: IDefineMap = {};

    constructor (root: Root) {
        this._root = root;
        this._device = root.device;
    }

    public abstract initialize (info: IRenderPipelineInfo): boolean;
    public abstract destroy ();
    public rebuild () { this.updateMacros(); }

    public resize (width: number, height: number) {

        const w = Math.floor(width * this._shadingScale);
        const h = Math.floor(height * this._shadingScale);
        if (w > this._shadingWidth ||
            h > this._shadingHeight) {
            // this._shadingScale = Math.min(this._shadingWidth / width, this._shadingHeight / height);
            // console.info('Resizing shading scale: ' + this._shadingScale);

            this.resizeFBOs(w, h);
        }

        for (const flow of this._flows) {
            flow.resize(width, height);
        }
    }

    public render (view: RenderView) {

        view.camera.update();

        this.sceneCulling(view);

        this.updateUBOs(view);

        for (const flow of view.flows) {
            flow.render(view);
        }
    }

    public swapFBOs () {
        const temp = this._curIdx;
        this._curIdx = this._prevIdx;
        this._prevIdx = temp;
    }

    public addRenderPass (stage: number, renderPass: GFXRenderPass) {
        if (renderPass) {
            this._renderPasses.set(stage, renderPass);
        }
    }

    public getRenderPass (stage: number): GFXRenderPass | null {
        const renderPass = this._renderPasses.get(stage);
        if (renderPass) {
            return renderPass;
        } else {
            return null;
        }
    }

    public removeRenderPass (stage: number) {
        this._renderPasses.delete(stage);
    }

    public clearRenderPasses () {
        this._renderPasses.clear();
    }

    public createFlow<T extends RenderFlow> (
        clazz: new (pipeline: RenderPipeline) => T,
        info: IRenderFlowInfo,
    ): RenderFlow | null {
        const flow: RenderFlow = new clazz(this);
        if (flow.initialize(info)) {
            this._flows.push(flow);
            this._flows.sort((a: RenderFlow, b: RenderFlow) => {
                return a.priority - b.priority;
            });

            return flow;
        } else {
            return null;
        }
    }

    public destroyFlows () {
        for (const flow of this._flows) {
            flow.destroy();
        }
        this._flows = [];
    }

    public getFlow (name: string): RenderFlow | null {
        for (const flow of this._flows) {
            if (flow.name === name) {
                return flow;
            }
        }

        return null;
    }

    protected _initialize (info: IRenderPipelineInfo): boolean {

        if (info.enablePostProcess !== undefined) {
            this._usePostProcess = info.enablePostProcess;
        } else {
            if (cc.sys.platform === cc.sys.WECHAT_GAME) {
                this._usePostProcess = true;
            } else {
                this._usePostProcess = true;
            }
        }

        if (this._usePostProcess) {
            if (this._device.hasFeature(GFXFeature.FORMAT_R11G11B10F) ||
                this._device.hasFeature(GFXFeature.TEXTURE_HALF_FLOAT) ||
                this._device.hasFeature(GFXFeature.TEXTURE_FLOAT)) {
                this._isHDRSupported = true;
            }

            // this._isHDRSupported = false;
            this._fboCount = 1;
            this._shadingTextures = new Array<GFXTexture>(this._fboCount);
            this._shadingTexViews = new Array<GFXTextureView>(this._fboCount);
            this._shadingFBOs = new Array<GFXFramebuffer>(this._fboCount);

            this._isHDR = (info.enableHDR !== undefined ? info.enableHDR : true);

            // Config Anti-Aliasing
            this._useSMAA = info.enableSMAA !== undefined ? info.enableSMAA : false;
            this._useMSAA = info.enableMSAA !== undefined ? info.enableMSAA : false;
            if (this._useMSAA) {
                this._useMSAA = this.device.hasFeature(GFXFeature.MSAA);
            }
        }

        if (this._isHDR && this._isHDRSupported) {
            // Try to use HDR format
            if (this._device.hasFeature(GFXFeature.COLOR_HALF_FLOAT) &&
                this._device.hasFeature(GFXFeature.TEXTURE_HALF_FLOAT_LINEAR)) {
                if (this._device.hasFeature(GFXFeature.FORMAT_R11G11B10F)) {
                    this._colorFmt = GFXFormat.R11G11B10F;
                    this._isHDR = true;
                } else if (this._device.hasFeature(GFXFeature.TEXTURE_HALF_FLOAT)) {
                    this._colorFmt = GFXFormat.RGBA16F;
                    this._isHDR = true;
                }
            } else if (this._device.hasFeature(GFXFeature.COLOR_FLOAT) &&
                this._device.hasFeature(GFXFeature.TEXTURE_FLOAT_LINEAR)) {
                if (this._device.hasFeature(GFXFeature.TEXTURE_FLOAT)) {
                    this._colorFmt = GFXFormat.RGBA32F;
                    this._isHDR = true;
                }
            }

            this._isHDR = false;
        }

        if (!this._isHDR) {
            this._colorFmt = GFXFormat.RGBA8;
        }

        if (this._device.depthBits === 24) {
            if (this._device.stencilBits === 8) {
               this._depthStencilFmt = GFXFormat.D24S8;
            } else {
               this._depthStencilFmt = GFXFormat.D24;
            }
        } else {
            this._depthStencilFmt = GFXFormat.D16;
        }

        this.updateMacros();

        // colorFmt = GFXFormat.RGBA16F;

        // this._shadingScale = this._device.devicePixelRatio;
        this._shadingScale = 1.0;
        this._shadingWidth = Math.floor(this._device.nativeWidth);
        this._shadingHeight = Math.floor(this._device.nativeHeight);

        console.info('USE_POST_PROCESS: ' + this._usePostProcess);
        if (this._usePostProcess) {
            console.info('USE_MSAA: ' + this._useMSAA);
            console.info('USE_SMAA: ' + this._useSMAA);
            console.info('USE_HDR: ' + this._isHDR);
        }
        console.info('SHADING_SIZE: ' + this._shadingWidth + ' x ' + this._shadingHeight);
        console.info('SHADING_SCALE: ' + this._shadingScale.toFixed(4));
        console.info('SHADING_COLOR_FORMAT: ' + GFXFormatInfos[this._colorFmt].name);
        console.info('SHADING_DEPTH_FORMAT: ' + GFXFormatInfos[this._depthStencilFmt].name);

        this._shadingPass = this._device.createRenderPass({
            colorAttachments: [{
                format: this._colorFmt,
                loadOp: GFXLoadOp.CLEAR,
                storeOp: GFXStoreOp.STORE,
                sampleCount: 1,
                beginLayout: GFXTextureLayout.COLOR_ATTACHMENT_OPTIMAL,
                endLayout: GFXTextureLayout.COLOR_ATTACHMENT_OPTIMAL,
            }],
            depthStencilAttachment: {
                format : this._depthStencilFmt,
                depthLoadOp : GFXLoadOp.CLEAR,
                depthStoreOp : GFXStoreOp.STORE,
                stencilLoadOp : GFXLoadOp.CLEAR,
                stencilStoreOp : GFXStoreOp.STORE,
                sampleCount : 1,
                beginLayout : GFXTextureLayout.DEPTH_STENCIL_ATTACHMENT_OPTIMAL,
                endLayout : GFXTextureLayout.DEPTH_STENCIL_ATTACHMENT_OPTIMAL,
            },
        });

        if (this._useMSAA) {
            this._msaaShadingTex  = this._device.createTexture({
                type: GFXTextureType.TEX2D,
                usage: GFXTextureUsageBit.COLOR_ATTACHMENT | GFXTextureUsageBit.SAMPLED,
                format: this._colorFmt,
                width: this._shadingWidth,
                height: this._shadingHeight,
            });
            this._msaaShadingTexView = this._device.createTextureView({
                texture : this._msaaShadingTex,
                type : GFXTextureViewType.TV2D,
                format : this._colorFmt,
            });
            this._msaaDepthStencilTex = this._device.createTexture({
                type : GFXTextureType.TEX2D,
                usage : GFXTextureUsageBit.DEPTH_STENCIL_ATTACHMENT | GFXTextureUsageBit.SAMPLED,
                format : this._depthStencilFmt,
                width : this._shadingWidth,
                height : this._shadingHeight,
            });
            this._msaaDepthStencilTexView = this._device.createTextureView({
                texture : this._msaaDepthStencilTex,
                type : GFXTextureViewType.TV2D,
                format : this._depthStencilFmt,
            });
            this._msaaShadingFBO = this._device.createFramebuffer({
                renderPass: this._shadingPass,
                colorViews: [ this._msaaShadingTexView ],
                depthStencilView: this._msaaDepthStencilTexView!,
            });
        }

        this._depthStencilTex = this._device.createTexture({
            type : GFXTextureType.TEX2D,
            usage : GFXTextureUsageBit.DEPTH_STENCIL_ATTACHMENT | GFXTextureUsageBit.SAMPLED,
            format : this._depthStencilFmt,
            width : this._shadingWidth,
            height : this._shadingHeight,
        });

        this._depthStencilTexView = this._device.createTextureView({
            texture : this._depthStencilTex,
            type : GFXTextureViewType.TV2D,
            format : this._depthStencilFmt,
        });

        for (let i = 0; i < this._fboCount; ++i) {
            this._shadingTextures[i] = this._device.createTexture({
                type: GFXTextureType.TEX2D,
                usage: GFXTextureUsageBit.COLOR_ATTACHMENT | GFXTextureUsageBit.SAMPLED,
                format: this._colorFmt,
                width: this._shadingWidth,
                height: this._shadingHeight,
            });

            this._shadingTexViews[i] = this._device.createTextureView({
                texture : this._shadingTextures[i],
                type : GFXTextureViewType.TV2D,
                format : this._colorFmt,
            });

            this._shadingFBOs[i] = this._device.createFramebuffer({
                renderPass: this._shadingPass,
                colorViews: [ this._shadingTexViews[i] ],
                depthStencilView: this._depthStencilTexView!,
            });
        }

        // create smaa framebuffer
        if (this._useSMAA) {
            const smaaColorFmt = GFXFormat.RGBA8;

            this._smaaPass = this._device.createRenderPass({
                colorAttachments: [{
                    format: smaaColorFmt,
                    loadOp: GFXLoadOp.CLEAR,
                    storeOp: GFXStoreOp.STORE,
                    sampleCount: 1,
                    beginLayout: GFXTextureLayout.COLOR_ATTACHMENT_OPTIMAL,
                    endLayout: GFXTextureLayout.COLOR_ATTACHMENT_OPTIMAL,
                }],
            });

            this._smaaEdgeTex =  this._device.createTexture({
                type: GFXTextureType.TEX2D,
                usage: GFXTextureUsageBit.COLOR_ATTACHMENT | GFXTextureUsageBit.SAMPLED,
                format: smaaColorFmt,
                width: this._shadingWidth,
                height: this._shadingHeight,
            });

            this._smaaEdgeTexView = this._device.createTextureView({
                texture : this._smaaEdgeTex,
                type : GFXTextureViewType.TV2D,
                format : smaaColorFmt,
            });

            this._smaaEdgeFBO = this._device.createFramebuffer({
                renderPass: this._smaaPass,
                colorViews: [ this._smaaEdgeTexView ],
                depthStencilView: null,
            });

            this._smaaBlendTex =  this._device.createTexture({
                type: GFXTextureType.TEX2D,
                usage: GFXTextureUsageBit.COLOR_ATTACHMENT | GFXTextureUsageBit.SAMPLED,
                format: smaaColorFmt,
                width: this._shadingWidth,
                height: this._shadingHeight,
            });

            this._smaaBlendTexView = this._device.createTextureView({
                texture : this._smaaBlendTex,
                type : GFXTextureViewType.TV2D,
                format : smaaColorFmt,
            });

            this._smaaBlendFBO = this._device.createFramebuffer({
                renderPass: this._smaaPass,
                colorViews: [ this._smaaBlendTexView ],
                depthStencilView: null,
            });
        }

        if (!this.createQuadInputAssembler()) {
            return false;
        }

        if (!this.createUBOs()) {
            return false;
        }

        return true;
    }

    protected _destroy () {

        this.destroyFlows();
        this.clearRenderPasses();
        this.destroyQuadInputAssembler();
        this.destroyUBOs();

        if (this._smaaEdgeTexView) {
            this._smaaEdgeTexView.destroy();
            this._smaaEdgeTexView = null;
        }

        if (this._smaaEdgeTex) {
            this._smaaEdgeTex.destroy();
            this._smaaEdgeTex = null;
        }

        if (this._smaaEdgeFBO) {
            this._smaaEdgeFBO.destroy();
            this._smaaEdgeFBO = null;
        }

        if (this._smaaBlendTexView) {
            this._smaaBlendTexView.destroy();
            this._smaaBlendTexView = null;
        }

        if (this._smaaBlendTex) {
            this._smaaBlendTex.destroy();
            this._smaaBlendTex = null;
        }

        if (this._smaaBlendFBO) {
            this._smaaBlendFBO.destroy();
            this._smaaBlendFBO = null;
        }

        if (this._msaaShadingTexView) {
            this._msaaShadingTexView.destroy();
            this._msaaShadingTexView = null;
        }
        if (this._msaaShadingTex) {
            this._msaaShadingTex.destroy();
            this._msaaShadingTex = null;
        }
        if (this._msaaDepthStencilTexView) {
            this._msaaDepthStencilTexView.destroy();
            this._msaaDepthStencilTexView = null;
        }
        if (this._msaaDepthStencilTex) {
            this._msaaDepthStencilTex.destroy();
            this._msaaDepthStencilTex = null;
        }
        if (this._msaaShadingFBO) {
            this._msaaShadingFBO.destroy();
            this._msaaShadingFBO = null;
        }

        for (let i = 0; i < this._shadingTexViews.length; ++i) {
            if (this._shadingTexViews[i]) {
                this._shadingTexViews[i].destroy();
            }

            if (this._shadingTextures[i]) {
                this._shadingTextures[i].destroy();
            }

            if (this._shadingFBOs[i]) {
                this._shadingFBOs[i].destroy();
            }
        }

        this._shadingTexViews.splice(0);
        this._shadingTextures.splice(0);
        this._shadingFBOs.splice(0);

        if (this._depthStencilTexView) {
            this._depthStencilTexView.destroy();
            this._depthStencilTexView = null;
        }
        if (this._depthStencilTex) {
            this._depthStencilTex.destroy();
            this._depthStencilTex = null;
        }

        if (this._shadingPass) {
            this._shadingPass.destroy();
            this._shadingPass = null;
        }
    }

    protected resizeFBOs (width: number, height: number) {

        this._shadingWidth = width;
        this._shadingHeight = height;

        if (this._depthStencilTex) {
            this._depthStencilTex.resize(width, height);
            this._depthStencilTexView!.destroy();
            this._depthStencilTexView!.initialize({
                texture : this._depthStencilTex,
                type : GFXTextureViewType.TV2D,
                format : this._depthStencilFmt,
            });
        }

        for (let i = 0; i < this._fboCount; ++i) {
            this._shadingTextures[i].resize(width, height);
            this._shadingTexViews[i].destroy();
            this._shadingTexViews[i].initialize({
                texture : this._shadingTextures[i],
                type : GFXTextureViewType.TV2D,
                format : this._colorFmt,
            });

            this._shadingFBOs[i].destroy();
            this._shadingFBOs[i].initialize({
                renderPass: this._shadingPass!,
                colorViews: [ this._shadingTexViews[i] ],
                depthStencilView: this._depthStencilTexView!,
            });
        }

        if (this._useMSAA) {
            this._msaaShadingTex!.resize(width, height);
            this._msaaShadingTexView!.destroy();
            this._msaaShadingTexView!.initialize({
                texture : this._msaaShadingTex!,
                type : GFXTextureViewType.TV2D,
                format : this._colorFmt,
            });
            this._msaaDepthStencilTex!.resize(width, height);
            this._msaaDepthStencilTexView!.destroy();
            this._msaaDepthStencilTexView!.initialize({
                texture : this._msaaDepthStencilTex!,
                type : GFXTextureViewType.TV2D,
                format : this._depthStencilFmt,
            });
            this._msaaShadingFBO!.destroy();
            this._msaaShadingFBO!.initialize({
                renderPass: this._shadingPass!,
                colorViews: [ this._msaaShadingTexView! ],
                depthStencilView: this._msaaDepthStencilTexView!,
            });
        }

        if (this._useSMAA) {
            const smaaColorFmt = this._smaaEdgeTex!.format;
            this._smaaEdgeTex!.resize(width, height);
            this._smaaEdgeTexView!.destroy();
            this._smaaEdgeTexView!.initialize({
                texture : this._smaaEdgeTex!,
                type : GFXTextureViewType.TV2D,
                format : smaaColorFmt,
            });

            this._smaaEdgeFBO!.destroy();
            this._smaaEdgeFBO!.initialize({
                renderPass: this._smaaPass!,
                colorViews: [ this._smaaEdgeTexView! ],
                depthStencilView: null,
            });
            this._smaaBlendTex!.resize(width, height);
            this._smaaBlendTexView!.destroy();
            this._smaaBlendTexView!.initialize({
                texture : this._smaaBlendTex!,
                type : GFXTextureViewType.TV2D,
                format : smaaColorFmt,
            });
            this._smaaBlendFBO!.destroy();
            this._smaaBlendFBO!.initialize({
                renderPass: this._smaaPass!,
                colorViews: [ this._smaaBlendTexView! ],
                depthStencilView: null,
            });
        }

        console.info('Resizing shading fbos: ' + this._shadingWidth + 'x' + this._shadingHeight);
    }

    protected updateMacros () {
        this._macros.CC_USE_HDR = (this._isHDR);
        programLib.destroyShaderByDefines(this._macros);
        for (const scene of this._root.scenes) {
            scene.onPipelineChange();
        }
    }

    protected createQuadInputAssembler (): boolean {

        // create vertex buffer

        const vbStride = Float32Array.BYTES_PER_ELEMENT * 4;
        const vbSize = vbStride * 4;

        this._quadVB = this._device.createBuffer({
            usage: GFXBufferUsageBit.VERTEX | GFXBufferUsageBit.TRANSFER_DST,
            memUsage: GFXMemoryUsageBit.HOST | GFXMemoryUsageBit.DEVICE,
            size: vbSize,
            stride: vbStride,
        });

        if (!this._quadVB) {
            return false;
        }

        const verts = new Float32Array(4 * 4);
        let n = 0;
        verts[n++] = -1.0; verts[n++] = -1.0; verts[n++] = 0.0; verts[n++] = 0.0;
        verts[n++] = 1.0; verts[n++] = -1.0; verts[n++] = 1.0; verts[n++] = 0.0;
        verts[n++] = -1.0; verts[n++] = 1.0; verts[n++] = 0.0; verts[n++] = 1.0;
        verts[n++] = 1.0; verts[n++] = 1.0; verts[n++] = 1.0; verts[n++] = 1.0;

        this._quadVB.update(verts);

        // create index buffer
        const ibStride = Uint8Array.BYTES_PER_ELEMENT;
        const ibSize = ibStride * 6;

        this._quadIB = this._device.createBuffer({
            usage: GFXBufferUsageBit.INDEX | GFXBufferUsageBit.TRANSFER_DST,
            memUsage: GFXMemoryUsageBit.HOST | GFXMemoryUsageBit.DEVICE,
            size: ibSize,
            stride: ibStride,
        });

        if (!this._quadIB) {
            return false;
        }

        const indices = new Uint8Array(6);
        indices[0] = 0; indices[1] = 1; indices[2] = 2;
        indices[3] = 1; indices[4] = 3; indices[5] = 2;

        this._quadIB.update(indices);

        // create input assembler

        const attributes: IGFXAttribute[] = [
            { name: 'a_position', format: GFXFormat.RG32F },
            { name: 'a_texCoord', format: GFXFormat.RG32F },
        ];

        this._quadIA = this._device.createInputAssembler({
            attributes,
            vertexBuffers: [this._quadVB],
            indexBuffer: this._quadIB,
        });

        return true;
    }

    protected destroyQuadInputAssembler () {
        if (this._quadVB) {
            this._quadVB.destroy();
            this._quadVB = null;
        }

        if (this._quadIB) {
            this._quadIB.destroy();
            this._quadIB = null;
        }

        if (this._quadIA) {
            this._quadIA.destroy();
            this._quadIA = null;
        }
    }

    protected createUBOs (): boolean {
        if (!this._globalBindings.get(UBOGlobal.BLOCK.name)) {
            const globalUBO = this._root.device.createBuffer({
                usage: GFXBufferUsageBit.UNIFORM | GFXBufferUsageBit.TRANSFER_DST,
                memUsage: GFXMemoryUsageBit.HOST | GFXMemoryUsageBit.DEVICE,
                size: UBOGlobal.SIZE,
            });

            if (!globalUBO) {
                return false;
            }

            this._globalBindings.set(UBOGlobal.BLOCK.name, {
                type: GFXBindingType.UNIFORM_BUFFER,
                blockInfo: UBOGlobal.BLOCK,
                buffer: globalUBO,
            });
        }

        if (!this._globalBindings.get(UBOShadow.BLOCK.name)) {
            const shadowUBO = this._root.device.createBuffer({
                usage: GFXBufferUsageBit.UNIFORM | GFXBufferUsageBit.TRANSFER_DST,
                memUsage: GFXMemoryUsageBit.HOST | GFXMemoryUsageBit.DEVICE,
                size: UBOShadow.SIZE,
            });

            if (!shadowUBO) {
                return false;
            }

            this._globalBindings.set(UBOShadow.BLOCK.name, {
                type: GFXBindingType.UNIFORM_BUFFER,
                blockInfo: UBOShadow.BLOCK,
                buffer: shadowUBO,
            });
        }

        return true;
    }

    protected destroyUBOs () {
        const globalUBO = this._globalBindings.get(UBOGlobal.BLOCK.name);
        if (globalUBO) {
            globalUBO.buffer!.destroy();
            this._globalBindings.delete(UBOGlobal.BLOCK.name);
        }
        const shadowUBO = this._globalBindings.get(UBOShadow.BLOCK.name);
        if (shadowUBO) {
            shadowUBO.buffer!.destroy();
            this._globalBindings.delete(UBOShadow.BLOCK.name);
        }
    }

    protected updateUBOs (view: RenderView) {

        const camera = view.camera;
        const scene = camera.scene;
        const device = this._root.device;

        const mainLight = scene.mainLight;

        const ambient = scene.ambient;

        // update UBOGlobal
        _vec4Array[0] = this._root.frameTime;
        _vec4Array[1] = 0.0;
        _vec4Array[2] = 0.0;
        _vec4Array[3] = 0.0;
        this._defaultUboGlobal.view.set(_vec4Array, UBOGlobal.TIME_OFFSET);

        _vec4Array[0] = device.width;
        _vec4Array[1] = device.height;
        _vec4Array[2] = 1.0 / _vec4Array[0];
        _vec4Array[3] = 1.0 / _vec4Array[1];
        this._defaultUboGlobal.view.set(_vec4Array, UBOGlobal.SCREEN_SIZE_OFFSET);

        _vec4Array[0] = camera.width / this._shadingWidth * this._shadingScale;
        _vec4Array[1] = camera.height / this._shadingHeight * this._shadingScale;
        _vec4Array[2] = 1.0 / _vec4Array[0];
        _vec4Array[3] = 1.0 / _vec4Array[1];
        this._defaultUboGlobal.view.set(_vec4Array, UBOGlobal.SCREEN_SCALE_OFFSET);

        _vec4Array[0] = this._shadingWidth;
        _vec4Array[1] = this._shadingHeight;
        _vec4Array[2] = 1.0 / _vec4Array[0];
        _vec4Array[3] = 1.0 / _vec4Array[1];
        this._defaultUboGlobal.view.set(_vec4Array, UBOGlobal.NATIVE_SIZE_OFFSET);

        mat4.array(_mat4Array, camera.matView);
        this._defaultUboGlobal.view.set(_mat4Array, UBOGlobal.MAT_VIEW_OFFSET);

        mat4.invert(_outMat, camera.matView);
        mat4.array(_mat4Array, _outMat);
        this._defaultUboGlobal.view.set(_mat4Array, UBOGlobal.MAT_VIEW_INV_OFFSET);

        mat4.array(_mat4Array, camera.matProj);
        this._defaultUboGlobal.view.set(_mat4Array, UBOGlobal.MAT_PROJ_OFFSET);

        mat4.invert(_outMat, camera.matProj);
        mat4.array(_mat4Array, _outMat);
        this._defaultUboGlobal.view.set(_mat4Array, UBOGlobal.MAT_PROJ_INV_OFFSET);

        mat4.array(_mat4Array, camera.matViewProj);
        this._defaultUboGlobal.view.set(_mat4Array, UBOGlobal.MAT_VIEW_PROJ_OFFSET);

        mat4.array(_mat4Array, camera.matViewProjInv);
        this._defaultUboGlobal.view.set(_mat4Array, UBOGlobal.MAT_VIEW_PROJ_INV_OFFSET);

        vec3.array(_vec4Array, camera.position);
        _vec4Array[3] = 1.0;
        this._defaultUboGlobal.view.set(_vec4Array, UBOGlobal.CAMERA_POS_OFFSET);

        const exposure = camera.exposure;
        _vec4Array[0] = exposure;
        _vec4Array[1] = 1.0 / exposure;
        _vec4Array[2] = this._isHDR ? 1.0 : 0.0;
        _vec4Array[3] = this._fpScale / exposure;
        this._defaultUboGlobal.view.set(_vec4Array, UBOGlobal.EXPOSURE_OFFSET);

        vec3.array(_vec4Array, mainLight.direction);
        this._defaultUboGlobal.view.set(_vec4Array, UBOGlobal.MAIN_LIT_DIR_OFFSET);

        if (mainLight.enabled) {
            vec3.array(_vec4Array, mainLight.color);
            if (mainLight.useColorTemperature) {
                const colorTempRGB = mainLight.colorTemperatureRGB;
                _vec4Array[0] *= colorTempRGB.x;
                _vec4Array[1] *= colorTempRGB.y;
                _vec4Array[2] *= colorTempRGB.z;
            }

            if (this._isHDR) {
                _vec4Array[3] = mainLight.illuminance * this._fpScale;
            } else {
                _vec4Array[3] = mainLight.illuminance * exposure;
            }
        } else {
            _vec4Array.set(_vec4ArrayZero);
        }
        this._defaultUboGlobal.view.set(_vec4Array, UBOGlobal.MAIN_LIT_COLOR_OFFSET);

        _vec4Array.set(ambient.skyColor);
        if (this._isHDR) {
            _vec4Array[3] = ambient.skyIllum * this._fpScale;
        } else {
            _vec4Array[3] = ambient.skyIllum * exposure;
        }
        this._defaultUboGlobal.view.set(_vec4Array, UBOGlobal.AMBIENT_SKY_OFFSET);

        _vec4Array.set(ambient.groundAlbedo);
        this._defaultUboGlobal.view.set(_vec4Array, UBOGlobal.AMBIENT_GROUND_OFFSET);

        // update ubos
        this._globalBindings.get(UBOGlobal.BLOCK.name)!.buffer!.update(this._defaultUboGlobal.view.buffer);

        const planarShadow = scene.planarShadow;
        if (planarShadow.enabled) {
            planarShadow.updateDirLight(scene.mainLight);
            this._globalBindings.get(UBOShadow.BLOCK.name)!.buffer!.update(planarShadow.data);
        }
    }

    protected sceneCulling (view: RenderView) {

        const camera = view.camera;
        const scene = camera.scene;

        this._renderObjects.splice(0);

        const mainLight = scene.mainLight;
        if (mainLight && mainLight.enabled) {
            mainLight.update();
        }

        if (scene.skybox.enabled) {
            this.addVisibleModel(scene.skybox, camera);
        }

        for (const model of scene.models) {

            model._resetUBOUpdateFlag();
            // filter model by view visibility
            if (view.visibility > 0 && model.viewID !== view.visibility || !model.enabled) {
                continue;
            }

            model.updateTransform();

            // frustum culling
            if (model.worldBounds && !intersect.aabb_frustum(model.worldBounds, camera.frustum)) {
                continue;
            }

            model.updateUBOs();
            this.addVisibleModel(model, camera);
        }
    }

    protected addVisibleModel (model: Model, camera: Camera) {
        let depth = 0;
        if (model.node) {
            model.node.getWorldPosition(_v3tmp);
            vec3.sub(_v3tmp, _v3tmp, camera.position);
            depth = vec3.dot(_v3tmp, camera.forward);
        }
        this._renderObjects.push({
            model,
            depth,
        });
    }
}
