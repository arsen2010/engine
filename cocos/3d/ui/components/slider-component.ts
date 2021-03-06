/****************************************************************************
 Copyright (c) 2013-2016 Chukong Technologies Inc.
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

import { Component, EventHandler as ComponentEventHandler } from '../../../components';
import { ccclass, executionOrder, menu, property } from '../../../core/data/class-decorator';
import { EventTouch, EventType } from '../../../core/platform';
import Touch from '../../../core/platform/event-manager/CCTouch';
import { clamp01 } from '../../../core/utils';
import { Vec3 } from '../../../core/value-types';
import { ccenum } from '../../../core/value-types/enum';
import { vec3 } from '../../../core/vmath';
import { SpriteComponent } from './sprite-component';

const _tempPos = new Vec3();
/**
 * @zh
 * 滑动器方向
 */
enum Direction {
    /**
     * @zh
     * 水平方向。
     */
    Horizontal = 0,
    /**
     * @zh
     * 垂直方向。
     */
    Vertical = 1,
}

ccenum(Direction);

/**
 * @zh
 * 滑动器组件。
 */
@ccclass('cc.SliderComponent')
@executionOrder(110)
@menu('UI/Slider')
export class SliderComponent extends Component {

    /**
     * @zh
     * 滑动器滑块按钮部件。
     */
    @property({
        type: SpriteComponent,
    })
    get handle () {
        return this._handle;
    }

    set handle (value: SpriteComponent | null) {
        if (this._handle === value) {
            return;
        }

        this._handle = value;
        if (CC_EDITOR && this._handle) {
            this._updateHandlePosition();
        }
    }

    /**
     * @zh
     * 滑动器方向。
     */
    @property({
        type: Direction,
    })
    get direction () {
        return this._direction;
    }

    set direction (value: number) {
        if (this._direction === value) {
            return;
        }

        this._direction = value;
    }

    /**
     * @zh
     * 当前进度值，该数值的区间是 0-1 之间。
     */
    @property({
        slide: true,
        range: [0, 1, 0.01],
    })
    get progress () {
        return this._progress;
    }

    set progress (value) {
        if (this._progress === value) {
            return;
        }

        this._progress = value;
        this._updateHandlePosition();
    }

    public static Direction = Direction;

    /**
     * @zh
     * 滑动器组件事件回调函数。
     */
    @property({
        type: ComponentEventHandler,
    })
    public slideEvents: ComponentEventHandler[] = [];
    @property
    private _handle: SpriteComponent | null = null;
    @property
    private _direction = Direction.Horizontal;
    @property
    private _progress = 0.1;

    private _offset: Vec3 = new Vec3();
    private _dragging = false;
    private _touchHandle = false;
    private _handlelocalPos = new Vec3();
    private _touchPos = new Vec3();

    public __preload () {
        this._updateHandlePosition();
    }

    // 注册事件
    public onEnable () {
        this._updateHandlePosition();

        this.node.on(EventType.TOUCH_START, this._onTouchBegan, this);
        this.node.on(EventType.TOUCH_MOVE, this._onTouchMoved, this);
        this.node.on(EventType.TOUCH_END, this._onTouchEnded, this);
        this.node.on(EventType.TOUCH_CANCEL, this._onTouchCancelled, this);
        if (this._handle && this._handle.isValid) {
            this._handle.node.on(EventType.TOUCH_START, this._onHandleDragStart, this);
            this._handle.node.on(EventType.TOUCH_MOVE, this._onTouchMoved, this);
            this._handle.node.on(EventType.TOUCH_END, this._onTouchEnded, this);
        }
    }

    public onDisable () {
        this.node.off(EventType.TOUCH_START, this._onTouchBegan, this);
        this.node.off(EventType.TOUCH_MOVE, this._onTouchMoved, this);
        this.node.off(EventType.TOUCH_END, this._onTouchEnded, this);
        this.node.off(EventType.TOUCH_CANCEL, this._onTouchCancelled, this);
        if (this._handle && this._handle.isValid) {
            this._handle.node.off(EventType.TOUCH_START, this._onHandleDragStart, this);
            this._handle.node.off(EventType.TOUCH_MOVE, this._onTouchMoved, this);
            this._handle.node.off(EventType.TOUCH_END, this._onTouchEnded, this);
        }
    }

    private _onHandleDragStart (event?: EventTouch) {
        if (!event || !this._handle || !this._handle.node.uiTransfromComp) {
            return;
        }

        this._dragging = true;
        this._touchHandle = true;
        const touhPos = event.touch!.getUILocation();
        vec3.set(this._touchPos, touhPos.x, touhPos.y, 0);
        this._handle.node.uiTransfromComp.convertToNodeSpaceAR(this._touchPos, this._offset);

        event.propagationStopped = true;
    }

    private _onTouchBegan (event?: EventTouch) {
        if (!this._handle || !event) {
            return;
        }

        this._dragging = true;
        if (!this._touchHandle) {
            this._handleSliderLogic(event.touch);
        }

        event.propagationStopped = true;
    }

    private _onTouchMoved (event?: EventTouch) {
        if (!this._dragging || !event) {
            return;
        }

        this._handleSliderLogic(event.touch);
        event.propagationStopped = true;
    }

    private _onTouchEnded (event?: EventTouch) {
        this._dragging = false;
        this._touchHandle = false;
        this._offset = cc.v2();

        if (event) {
            event.propagationStopped = true;
        }
    }

    private _onTouchCancelled (event?: EventTouch) {
        this._dragging = false;
        if (event) {
            event.propagationStopped = true;
        }
    }

    private _handleSliderLogic (touch: Touch | null) {
        this._updateProgress(touch);
        this._emitSlideEvent();
    }

    private _emitSlideEvent () {
        cc.Component.EventHandler.emitEvents(this.slideEvents, this);
        this.node.emit('slide', this);
    }

    private _updateProgress (touch: Touch | null) {
        if (!this._handle || !touch) {
            return;
        }

        const touchPos = touch.getUILocation();
        vec3.set(this._touchPos, touchPos.x, touchPos.y, 0);
        const localTouchPos = this.node.uiTransfromComp!.convertToNodeSpaceAR(this._touchPos, _tempPos);
        if (this.direction === Direction.Horizontal) {
            this.progress = clamp01(0.5 + (localTouchPos.x - this._offset.x) / this.node.width!);
        } else {
            this.progress = clamp01(0.5 + (localTouchPos.y - this._offset.y) / this.node.height!);
        }
    }

    private _updateHandlePosition () {
        if (!this._handle) {
            return;
        }
        this._handlelocalPos.set(this._handle.node.getPosition());
        if (this._direction === Direction.Horizontal) {
            this._handlelocalPos.x = -this.node.width! * this.node.anchorX! + this.progress * this.node.width!;
        } else {
            this._handlelocalPos.y = -this.node.height! * this.node.anchorY! + this.progress * this.node.height!;
        }

        this._handle.node.setPosition(this._handlelocalPos);
    }
}

cc.SliderComponent = SliderComponent;

/**
 * @zh
 * 注意：此事件是从该组件所属的 Node 上面派发出来的，需要用 node.on 来监听。
 * @event slide
 * @param {Event.EventCustom} event
 * @param {Slider} slider - The slider component.
 */
