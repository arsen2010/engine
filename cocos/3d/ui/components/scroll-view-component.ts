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
import { EventHandler as ComponentEventHandler } from '../../../components';
import { ccclass, executionOrder, menu, property } from '../../../core/data/class-decorator';
import { Event } from '../../../core/event';
import { EventMouse, EventTouch } from '../../../core/platform';
import Touch from '../../../core/platform/event-manager/CCTouch';
import { Size, Vec2, Vec3 } from '../../../core/value-types';
import { ccenum } from '../../../core/value-types/enum';
import { vec3 } from '../../../core/vmath';
import { Node } from '../../../scene-graph/node';
import { LayoutComponent } from './layout-component';
import { ScrollBarComponent } from './scroll-bar-component';
import { ViewGroupComponent } from './view-group-component';

const NodeEvent = Node.EventType;

const NUMBER_OF_GATHERED_TOUCHES_FOR_MOVE_SPEED = 5;
const OUT_OF_BOUNDARY_BREAKING_FACTOR = 0.05;
const EPSILON = 1e-4;
const MOVEMENT_FACTOR = 0.7;
const ZERO = new Vec3();
const _tempPos = new Vec3();

const quintEaseOut = (time) => {
    time -= 1;
    return (time * time * time * time * time + 1);
};

const getTimeInMilliseconds = () => {
    const currentTime = new Date();
    return currentTime.getMilliseconds();
};

/**
 * @zh
 * 滚动视图事件类型。
 */
enum EventType {
    /**
     * @zh
     * 滚动视图滚动到顶部边界事件。
     */
    SCROLL_TO_TOP = 0,
    /**
     * @zh
     * 滚动视图滚动到底部边界事件。
     */
    SCROLL_TO_BOTTOM = 1,
    /**
     * @zh
     * 滚动视图滚动到左边界事件。
     */
    SCROLL_TO_LEFT = 2,
    /**
     * @zh
     * 滚动视图滚动到右边界事件。
     */
    SCROLL_TO_RIGHT = 3,
    /**
     * @zh
     * 滚动视图正在滚动时发出的事件。
     */
    SCROLLING = 4,
    /**
     * @zh
     * 滚动视图滚动到顶部边界并且开始回弹时发出的事件。
     */
    BOUNCE_TOP = 5,
    /**
     * @zh
     * 滚动视图滚动到底部边界并且开始回弹时发出的事件。
     */
    BOUNCE_BOTTOM = 6,
    /**
     * @zh
     * 滚动视图滚动到左边界并且开始回弹时发出的事件。
     */
    BOUNCE_LEFT = 7,
    /**
     * @zh
     * 滚动视图滚动到右边界并且开始回弹时发出的事件。
     */
    BOUNCE_RIGHT = 8,
    /**
     * @zh
     * 滚动视图滚动结束的时候发出的事件。
     */
    SCROLL_ENDED = 9,
    /**
     * @zh
     * 当用户松手的时候会发出一个事件。
     */
    TOUCH_UP = 10,
    /**
     * @zh
     * 滚动视图自动滚动快要结束的时候发出的事件。
     */
    AUTOSCROLL_ENDED_WITH_THRESHOLD = 11,
    /**
     * @zh
     * 滚动视图滚动开始时发出的事件。
     */
    SCROLL_BEGAN = 12,
}

ccenum(EventType);

const eventMap = {
    'scroll-to-top': EventType.SCROLL_TO_TOP,
    'scroll-to-bottom': EventType.SCROLL_TO_BOTTOM,
    'scroll-to-left': EventType.SCROLL_TO_LEFT,
    'scroll-to-right': EventType.SCROLL_TO_RIGHT,
    'scrolling': EventType.SCROLLING,
    'bounce-bottom': EventType.BOUNCE_BOTTOM,
    'bounce-left': EventType.BOUNCE_LEFT,
    'bounce-right': EventType.BOUNCE_RIGHT,
    'bounce-top': EventType.BOUNCE_TOP,
    'scroll-ended': EventType.SCROLL_ENDED,
    'touch-up': EventType.TOUCH_UP,
    'scroll-ended-with-threshold': EventType.AUTOSCROLL_ENDED_WITH_THRESHOLD,
    'scroll-began': EventType.SCROLL_BEGAN,
};

/**
 * @zh
 * 滚动视图组件
 */

@ccclass('cc.ScrollViewComponent')
@executionOrder(110)
@menu('UI/ScrollView')
export class ScrollViewComponent extends ViewGroupComponent {

    /**
     * @zh
     * 可滚动展示内容的节点。
     */
    @property({
        type: Node,
    })
    get content () {
        return this._content;
    }
    set content (value: Node | null) {
        if (this._content === value){
            return;
        }

        this._content = value;
        this._calculateBoundary();
    }

    /**
     * @zh
     * 水平滚动的 ScrollBar。
     */
    @property({
        type: ScrollBarComponent,
    })
    get horizontalScrollBar () {
        return this._horizontalScrollBar;
    }

    set horizontalScrollBar (value: ScrollBarComponent | null) {
        if (this._horizontalScrollBar === value){
            return;
        }

        this._horizontalScrollBar = value;

        if (this._horizontalScrollBar) {
            this._horizontalScrollBar.setScrollView(this);
            // this._updateScrollBar(0);
            this._updateScrollBar(ZERO);
        }
    }

    /**
     * @zh
     * 垂直滚动的 ScrollBar。
     */
    @property({
        type: ScrollBarComponent,
    })
    get verticalScrollBar () {
        return this._verticalScrollBar;
    }

    set verticalScrollBar (value: ScrollBarComponent | null) {
        if (this._verticalScrollBar === value) {
            return;
        }

        this._verticalScrollBar = value;

        if (this._verticalScrollBar) {
            this._verticalScrollBar.setScrollView(this);
            this._updateScrollBar(ZERO);
        }
    }

    get view () {
        if (!this._content) {
            return null;
        }

        return this._content.parent;
    }

    public static EventType = EventType;
    /**
     * @zh
     * 是否开启水平滚动。
     */
    @property
    public horizontal = true;

    /**
     * @zh
     * 是否开启垂直滚动。
     */
    @property
    public vertical = true;

    /**
     * @zh
     * 是否开启滚动惯性。
     */
    @property
    public inertia = true;

    /**
     * @zh
     * 开启惯性后，在用户停止触摸后滚动多快停止，0表示永不停止，1表示立刻停止。
     */
    @property({
        range: [0, 1, 0.1],
    })
    public brake = 0.5;

    /**
     * @zh
     * 是否允许滚动内容超过边界，并在停止触摸后回弹。
     */
    @property
    public elastic = true;

    /**
     * @zh
     * 回弹持续的时间，0 表示将立即反弹。
     */
    @property({
        range: [0, 10],
    })
    public bounceDuration = 1;

    /**
     * @zh
     * 滚动视图的事件回调函数.
     */
    @property({
        type: ComponentEventHandler,
    })
    public scrollEvents: ComponentEventHandler[] = [];

    /**
     * @zh
     * 如果这个属性被设置为 true，那么滚动行为会取消子节点上注册的触摸事件，默认被设置为 true。<br/>
     * 注意，子节点上的 touchstart 事件仍然会触发，触点移动距离非常短的情况下 touchmove 和 touchend 也不会受影响。
     */
    @property
    public cancelInnerEvents = true;
    @property
    private _content: Node | null = null;
    @property
    private _horizontalScrollBar: ScrollBarComponent | null = null;
    @property
    private _verticalScrollBar: ScrollBarComponent | null = null;

    private _topBoundary = 0;
    private _bottomBoundary = 0;
    private _leftBoundary = 0;
    private _rightBoundary = 0;

    private _touchMoveDisplacements: Vec3[] = [];
    private _touchMoveTimeDeltas: number[] = [];
    private _touchMovePreviousTimestamp = 0;
    private _touchMoved = false;

    private _autoScrolling = false;
    private _autoScrollAttenuate = false;
    private _autoScrollStartPosition = new Vec3();
    private _autoScrollTargetDelta = new Vec3();
    private _autoScrollTotalTime = 0;
    private _autoScrollAccumulatedTime = 0;
    private _autoScrollCurrentlyOutOfBoundary = false;
    private _autoScrollBraking = false;
    private _autoScrollBrakingStartPosition = new Vec3();

    private _outOfBoundaryAmount = new Vec3();
    private _outOfBoundaryAmountDirty = true;
    private _stopMouseWheel = false;
    private _mouseWheelEventElapsedTime = 0.0;
    private _isScrollEndedWithThresholdEventFired = false;
    // use bit wise operations to indicate the direction
    private _scrollEventEmitMask = 0;
    private _isBouncing = false;
    private _scrolling = false;
    private _contentPos = new Vec3();
    private _deltaPos = new Vec3();

    /**
     * @zh
     * 视图内容将在规定时间内滚动到视图底部。
     *
     * @param timeInSecond - 滚动时间（s）。 如果超时，内容将立即跳到底部边界。
     * @param attenuated - 滚动加速是否衰减，默认为 true.
     * @example
     * ```ts
     * // Scroll to the bottom of the view.
     * scrollView.scrollToBottom(0.1);
     * ```
     */
    public scrollToBottom (timeInSecond: number, attenuated: boolean) {
        const moveDelta = this._calculateMovePercentDelta({
            anchor: new Vec2(0, 0),
            applyToHorizontal: false,
            applyToVertical: true,
        });

        if (timeInSecond) {
            this._startAutoScroll(moveDelta, timeInSecond, attenuated !== false);
        } else {
            this._moveContent(moveDelta, true);
        }
    }

    /**
     * @zh
     * 视图内容将在规定时间内滚动到视图顶部。
     *
     * @param timeInSecond - 滚动时间（s）。 如果超时，内容将立即跳到顶部边界。
     * @param attenuated - 滚动加速是否衰减，默认为 true.
     * @example
     * ```ts
     * // Scroll to the top of the view.
     * scrollView.scrollToTop(0.1);
     * ```
     */
    public scrollToTop (timeInSecond: number, attenuated: boolean) {
        const moveDelta = this._calculateMovePercentDelta({
            anchor: new Vec2(0, 1),
            applyToHorizontal: false,
            applyToVertical: true,
        });

        if (timeInSecond) {
            this._startAutoScroll(moveDelta, timeInSecond, attenuated !== false);
        } else {
            this._moveContent(moveDelta);
        }
    }

    /**
     * @zh
     * 视图内容将在规定时间内滚动到视图左边。
     *
     * @param timeInSecond - 滚动时间（s）。 如果超时，内容将立即跳到左边边界。
     * @param attenuated - 滚动加速是否衰减，默认为 true。
     * @example
     * ```ts
     * // Scroll to the left of the view.
     * scrollView.scrollToLeft(0.1);
     * ```
     */
    public scrollToLeft (timeInSecond: number, attenuated: boolean) {
        const moveDelta = this._calculateMovePercentDelta({
            anchor: new Vec2(0, 0),
            applyToHorizontal: true,
            applyToVertical: false,
        });

        if (timeInSecond) {
            this._startAutoScroll(moveDelta, timeInSecond, attenuated !== false);
        } else {
            this._moveContent(moveDelta);
        }
    }

    /**
     * @zh
     * 视图内容将在规定时间内滚动到视图右边。
     *
     * @param timeInSecond - 滚动时间（s）。 如果超时，内容将立即跳到右边边界。
     * @param attenuated - 滚动加速是否衰减，默认为 true。
     * @example
     * ```ts
     * // Scroll to the right of the view.
     * scrollView.scrollToRight(0.1);
     * ```
     */
    public scrollToRight (timeInSecond: number, attenuated: boolean) {
        const moveDelta = this._calculateMovePercentDelta({
            anchor: new Vec2(1, 0),
            applyToHorizontal: true,
            applyToVertical: false,
        });

        if (timeInSecond) {
            this._startAutoScroll(moveDelta, timeInSecond, attenuated !== false);
        } else {
            this._moveContent(moveDelta);
        }
    }

    /**
     * @zh
     * 视图内容将在规定时间内滚动到视图左上角。
     *
     * @param timeInSecond - 滚动时间（s）。 如果超时，内容将立即跳到左上边边界。
     * @param attenuated - 滚动加速是否衰减，默认为 true。
     * @example
     * ```ts
     * // Scroll to the upper left corner of the view.
     * scrollView.scrollToTopLeft(0.1);
     * ```
     */
    public scrollToTopLeft (timeInSecond, attenuated) {
        const moveDelta = this._calculateMovePercentDelta({
            anchor: new Vec2(0, 1),
            applyToHorizontal: true,
            applyToVertical: true,
        });

        if (timeInSecond) {
            this._startAutoScroll(moveDelta, timeInSecond, attenuated !== false);
        } else {
            this._moveContent(moveDelta);
        }
    }

    /**
     * @zh
     * 视图内容将在规定时间内滚动到视图右上角。
     *
     * @param timeInSecond - 滚动时间（s）。 如果超时，内容将立即跳到右上边界。
     * @param attenuated - 滚动加速是否衰减，默认为 true。
     * @example
     * ```ts
     * // Scroll to the top right corner of the view.
     * scrollView.scrollToTopRight(0.1);
     * ```
     */
    public scrollToTopRight (timeInSecond: number, attenuated: boolean) {
        const moveDelta = this._calculateMovePercentDelta({
            anchor: new Vec2(1, 1),
            applyToHorizontal: true,
            applyToVertical: true,
        });

        if (timeInSecond) {
            this._startAutoScroll(moveDelta, timeInSecond, attenuated !== false);
        } else {
            this._moveContent(moveDelta);
        }
    }

    /**
     * @zh
     * 视图内容将在规定时间内滚动到视图左下角。
     *
     * @param timeInSecond - 滚动时间（s）。 如果超时，内容将立即跳到左下边界。
     * @param attenuated - 滚动加速是否衰减，默认为 true。
     * @example
     * ```ts
     * // Scroll to the lower left corner of the view.
     * scrollView.scrollToBottomLeft(0.1);
     * ```
     */
    public scrollToBottomLeft (timeInSecond: number, attenuated: boolean) {
        const moveDelta = this._calculateMovePercentDelta({
            anchor: new Vec2(0, 0),
            applyToHorizontal: true,
            applyToVertical: true,
        });

        if (timeInSecond) {
            this._startAutoScroll(moveDelta, timeInSecond, attenuated !== false);
        } else {
            this._moveContent(moveDelta);
        }
    }

    /**
     * @zh
     * 视图内容将在规定时间内滚动到视图右下角。
     *
     * @param timeInSecond - 滚动时间（s）。 如果超时，内容将立即跳到右边下边界。
     * @param attenuated - 滚动加速是否衰减，默认为 true。
     * @example
     * ```ts
     * // Scroll to the lower right corner of the view.
     * scrollView.scrollToBottomRight(0.1);
     * ```
     */
    public scrollToBottomRight (timeInSecond: number, attenuated: boolean) {
        const moveDelta = this._calculateMovePercentDelta({
            anchor: new Vec2(1, 0),
            applyToHorizontal: true,
            applyToVertical: true,
        });

        if (timeInSecond) {
            this._startAutoScroll(moveDelta, timeInSecond, attenuated !== false);
        } else {
            this._moveContent(moveDelta);
        }
    }

    /**
     * @zh
     * 视图内容在规定时间内将滚动到 ScrollView 相对左上角原点的偏移位置, 如果 timeInSecond 参数不传，则立即滚动到指定偏移位置。
     *
     * @param offset - 指定移动偏移量。
     * @param timeInSecond - 滚动时间（s）。 如果超时，内容将立即跳到指定偏移量处。
     * @param attenuated - 滚动加速是否衰减，默认为 true。
     * @example
     * ```ts
     * // Scroll to middle position in 0.1 second in x-axis
     * let maxScrollOffset = this.getMaxScrollOffset();
     * scrollView.scrollToOffset(new Vec3(maxScrollOffset.x / 2, 0, 0), 0.1);
     * ```
     */
    public scrollToOffset (offset: Vec3, timeInSecond: number, attenuated: boolean) {
        const maxScrollOffset = this.getMaxScrollOffset();

        const anchor = new Vec2(0, 0);
        // if maxScrollOffset is 0, then always align the content's top left origin to the top left corner of its parent
        if (maxScrollOffset.x === 0) {
            anchor.x = 0;
        } else {
            anchor.x = offset.x / maxScrollOffset.x;
        }

        if (maxScrollOffset.y === 0) {
            anchor.y = 1;
        } else {
            anchor.y = (maxScrollOffset.y - offset.y) / maxScrollOffset.y;
        }

        this.scrollTo(anchor, timeInSecond, attenuated);
    }

    /**
     * @zh
     * 获取滚动视图相对于左上角原点的当前滚动偏移。
     *
     * @return - 当前滚动偏移量。
     */
    public getScrollOffset () {
        const topDelta = this._getContentTopBoundary() - this._topBoundary;
        const leftDeta = this._getContentLeftBoundary() - this._leftBoundary;

        return new Vec3(leftDeta, topDelta, 0);
    }

    /**
     * @zh
     * 获取滚动视图最大可以滚动的偏移量
     *
     * @return - 最大可滚动偏移量.
     */
    public getMaxScrollOffset () {
        const scrollSize = this.node.getContentSize();
        const contentSize = this._content!.getContentSize();
        let horizontalMaximizeOffset = contentSize.width - scrollSize.width;
        let verticalMaximizeOffset = contentSize.height - scrollSize.height;
        horizontalMaximizeOffset = horizontalMaximizeOffset >= 0 ? horizontalMaximizeOffset : 0;
        verticalMaximizeOffset = verticalMaximizeOffset >= 0 ? verticalMaximizeOffset : 0;

        return new Vec3(horizontalMaximizeOffset, verticalMaximizeOffset, 0);
    }

    /**
     * @zh
     * 视图内容在规定时间内将滚动到 ScrollView 水平方向的百分比位置上。
     *
     * @param percent - 0 - 之间的百分比。
     * @param timeInSecond - 滚动时间（s）。 如果超时，内容将立即跳到指定水平百分比位置。
     * @param attenuated - 滚动加速是否衰减，默认为 true。
     * @example
     * ```ts
     * // Scroll to middle position.
     * scrollView.scrollToBottomRight(0.5, 0.1);
     * ```
     */
    public scrollToPercentHorizontal (percent: number, timeInSecond: number, attenuated: boolean) {
        const moveDelta = this._calculateMovePercentDelta({
            anchor: new Vec2(percent, 0),
            applyToHorizontal: true,
            applyToVertical: false,
        });

        if (timeInSecond) {
            this._startAutoScroll(moveDelta, timeInSecond, attenuated !== false);
        } else {
            this._moveContent(moveDelta);
        }
    }

    /**
     * @zh
     * 视图内容在规定时间内进行垂直方向和水平方向的滚动，并且滚动到指定百分比位置上。
     *
     * @param anchor - 在 new Vec2(0,0) and new Vec2(1,1) 上取差值的一个点.
     * @param timeInSecond - 滚动时间（s）。 如果超时，内容将立即跳到指定水平或垂直百分比位置。
     * @param attenuated - 滚动加速是否衰减，默认为 true。
     * @example
     * ```ts
     * // Vertical scroll to the bottom of the view.
     * scrollView.scrollTo(new Vec2(0, 1), 0.1);
     *
     * // Horizontal scroll to view right.
     * scrollView.scrollTo(new Vec2(1, 0), 0.1);
     * ```
     */
    public scrollTo (anchor: Vec2, timeInSecond: number, attenuated?: boolean) {
        const moveDelta = this._calculateMovePercentDelta({
            anchor: new Vec2(anchor),
            applyToHorizontal: true,
            applyToVertical: true,
        });

        if (timeInSecond) {
            this._startAutoScroll(moveDelta, timeInSecond, attenuated);
        } else {
            this._moveContent(moveDelta);
        }
    }

    /**
     * @zh
     * 视图内容在规定时间内滚动到 ScrollView 垂直方向的百分比位置上。
     *
     * @param percent - 0 - 1 之间的百分比.
     * @param timeInSecond - 滚动时间（s）。 如果超时，内容将立即跳到指定垂直百分比位置。
     * @param attenuated - 滚动加速是否衰减，默认为 true。
     * @example
     * ```ts
     * scrollView.scrollToPercentVertical(0.5, 0.1);
     * ```
     */
    public scrollToPercentVertical (percent: number, timeInSecond: number, attenuated?: boolean) {
        const moveDelta = this._calculateMovePercentDelta({
            anchor: new Vec2(0, percent),
            applyToHorizontal: false,
            applyToVertical: true,
        });

        if (timeInSecond) {
            this._startAutoScroll(moveDelta, timeInSecond, attenuated);
        } else {
            this._moveContent(moveDelta);
        }
    }

    /**
     * @zh
     * 停止自动滚动, 调用此 API 可以让 Scrollview 立即停止滚动。
     */
    public stopAutoScroll () {
        this._autoScrolling = false;
        this._autoScrollAccumulatedTime = this._autoScrollTotalTime;
    }

    /**
     * @zh
     * 设置当前视图内容的坐标点。
     *
     * @param position - 当前视图坐标点.
     */
    public setContentPosition (position: Vec3) {
        if (position.fuzzyEquals(this.getContentPosition(), EPSILON)) {
            return;
        }

        this._content!.setPosition(position);
        this._outOfBoundaryAmountDirty = true;
    }

    /**
     * @zh
     * 获取当前视图内容的坐标点。
     *
     * @returns - 当前视图内容的坐标点.
     */
    public getContentPosition () {
        if (!this._content){
            return ZERO;
        }

        this._content.getPosition(this._contentPos);
        return this._contentPos;
    }

    /**
     * @zh
     * 用户是否在拖拽当前滚动视图。
     *
     * @returns - 是否在拖拽当前滚动视图。
     */
    public isScrolling () {
        return this._scrolling;
    }

    /**
     * @zh
     * 当前滚动视图是否在惯性滚动。
     *
     * @returns - 滚动视图是否在惯性滚动。
     */
    public isAutoScrolling () {
        return this._autoScrolling;
    }

    public getScrollEndedEventTiming () {
        return EPSILON;
    }

    public start () {
        this._calculateBoundary();
        // Because widget component will adjust content position and scrollview position is correct after visit
        // So this event could make sure the content is on the correct position after loading.
        if (this._content) {
            cc.director.once(cc.Director.EVENT_BEFORE_DRAW, this._adjustContentOutOfBoundary, this);
        }
    }

    public onEnable () {
        if (!CC_EDITOR) {
            this._registerEvent();
            if (this.content) {
                this.content.on(NodeEvent.SIZE_CHANGED, this._calculateBoundary, this);
                this.content.on(NodeEvent.SCALE_PART, this._calculateBoundary, this);
                if (this.view!) {
                    this.view!.on(NodeEvent.POSITION_PART, this._calculateBoundary, this);
                    this.view!.on(NodeEvent.SCALE_PART, this._calculateBoundary, this);
                    this.view!.on(NodeEvent.SIZE_CHANGED, this._calculateBoundary, this);
                }
            }
        }
        this._showScrollbar();
    }

    public update (dt: number) {
        if (this._autoScrolling) {
            this._processAutoScrolling(dt);
        }
    }

    public onDisable () {
        if (!CC_EDITOR) {
            this._unregisterEvent();
            if (this.content) {
                this.content.off(NodeEvent.SIZE_CHANGED, this._calculateBoundary, this);
                this.content.off(NodeEvent.SCALE_PART, this._calculateBoundary, this);
                if (this.view!) {
                    this.view!.off(NodeEvent.POSITION_PART, this._calculateBoundary, this);
                    this.view!.off(NodeEvent.SCALE_PART, this._calculateBoundary, this);
                    this.view!.off(NodeEvent.SIZE_CHANGED, this._calculateBoundary, this);
                }
            }
        }
        this._hideScrollbar();
        this.stopAutoScroll();
    }

    // private methods
    private _registerEvent () {
        this.node.on(NodeEvent.TOUCH_START, this._onTouchBegan, this, true);
        this.node.on(NodeEvent.TOUCH_MOVE, this._onTouchMoved, this, true);
        this.node.on(NodeEvent.TOUCH_END, this._onTouchEnded, this, true);
        this.node.on(NodeEvent.TOUCH_CANCEL, this._onTouchCancelled, this, true);
        this.node.on(NodeEvent.MOUSE_WHEEL, this._onMouseWheel, this, true);
    }

    private _unregisterEvent () {
        this.node.off(NodeEvent.TOUCH_START, this._onTouchBegan, this, true);
        this.node.off(NodeEvent.TOUCH_MOVE, this._onTouchMoved, this, true);
        this.node.off(NodeEvent.TOUCH_END, this._onTouchEnded, this, true);
        this.node.off(NodeEvent.TOUCH_CANCEL, this._onTouchCancelled, this, true);
        this.node.off(NodeEvent.MOUSE_WHEEL, this._onMouseWheel, this, true);
    }

    /**
     * @zh
     * 鼠标滚轮事件。
     *
     * @param event - 鼠标事件信息。
     * @param captureListeners
     */
    private _onMouseWheel (event: EventMouse, captureListeners?: any) {
        if (!this.enabledInHierarchy) {
            return;
        }

        if (this._hasNestedViewGroup(event, captureListeners)) {
            return;
        }

        let deltaMove = new Vec3();
        let wheelPrecision = -0.1;
        if (CC_JSB) {
            wheelPrecision = -7;
        }
        if (this.vertical) {
            deltaMove = new Vec3(0, event.getScrollY() * wheelPrecision, 0);
        }
        else if (this.horizontal) {
            deltaMove = new Vec3(event.getScrollY() * wheelPrecision, 0, 0);
        }

        this._mouseWheelEventElapsedTime = 0;
        this._processDeltaMove(deltaMove);

        if (!this._stopMouseWheel) {
            this._handlePressLogic();
            this.schedule(this._checkMouseWheel, 1.0 / 60, NaN, 0);
            this._stopMouseWheel = true;
        }

        this._stopPropagationIfTargetIsMe(event);
    }

    // touch event handler
    private _onTouchBegan (event?: EventTouch, captureListeners?: any) {
        if (!this.enabledInHierarchy || !this._content) { return; }
        if (this._hasNestedViewGroup(event, captureListeners)) { return; }

        // let touch = event.touch;
        if (this._content) {
            this._handlePressLogic();
        }
        this._touchMoved = false;
        this._stopPropagationIfTargetIsMe(event);
    }

    private _onTouchMoved (event?: EventTouch, captureListeners?: any) {
        if (!this.enabledInHierarchy || !this._content) { return; }
        if (this._hasNestedViewGroup(event, captureListeners)) { return; }

        if (!event || !event.touch) {
            return;
        }

        const touch = event.touch;
        if (this._content) {
            this._handleMoveLogic(touch);
        }
        // Do not prevent touch events in inner nodes
        if (!this.cancelInnerEvents) {
            return;
        }

        const deltaMove = touch.getUILocation().sub(touch.getStartLocation());
        // FIXME: touch move delta should be calculated by DPI.
        if (deltaMove.mag() > 7) {
            if (!this._touchMoved && event.target !== this.node) {
                // Simulate touch cancel for target node
                const cancelEvent = new EventTouch(event.getTouches(), event.bubbles);
                cancelEvent.type = NodeEvent.TOUCH_CANCEL;
                cancelEvent.touch = event.touch;
                cancelEvent.simulate = true;
                (event.target as Node)!.dispatchEvent(cancelEvent);
                this._touchMoved = true;
            }
        }
        this._stopPropagationIfTargetIsMe(event);
    }

    private _onTouchEnded (event?: EventTouch, captureListeners?: any) {
        if (!this.enabledInHierarchy || !this._content || !event) { return; }
        if (this._hasNestedViewGroup(event, captureListeners)) { return; }

        this._dispatchEvent('touch-up');

        const touch = event.touch;
        if (this._content) {
            this._handleReleaseLogic(touch);
        }
        if (this._touchMoved) {
            event.propagationStopped = true;
        } else {
            this._stopPropagationIfTargetIsMe(event);
        }
    }

    private _onTouchCancelled (event?: EventTouch, captureListeners?: any) {
        if (!this.enabledInHierarchy || !this._content) { return; }
        if (this._hasNestedViewGroup(event, captureListeners)) { return; }

        // Filte touch cancel event send from self
        if (event && !event.simulate) {
            const touch = event.touch;
            if (this._content) {
                this._handleReleaseLogic(touch);
            }
        }
        this._stopPropagationIfTargetIsMe(event);
    }

    /**
     * @zh
     * 重新计算内容活动边界（view）
     */
    private _calculateBoundary () {
        if (this.content) {
            // refresh content size
            const layout = this.content.getComponent(LayoutComponent);
            if (layout && layout.enabledInHierarchy) {
                layout.updateLayout();
            }
            const viewSize = this.view!.getContentSize();

            const anchorX = viewSize.width * this.view!.anchorX;
            const anchorY = viewSize.height * this.view!.anchorY;

            this._leftBoundary = -anchorX;
            this._bottomBoundary = -anchorY;

            this._rightBoundary = this._leftBoundary + viewSize.width;
            this._topBoundary = this._bottomBoundary + viewSize.height;

            this._moveContentToTopLeft(viewSize);
        }

    }

    // this is for nested scrollview
    private _hasNestedViewGroup (event?: Event, captureListeners?: any) {
        if (!event || event.eventPhase !== cc.Event.CAPTURING_PHASE) {
            return;
        }

        if (captureListeners) {
            // captureListeners are arranged from child to parent
            for (const listerner of captureListeners) {
                const item = listerner as Node;

                if (this.node === item) {
                    if (event.target && (event.target as Node).getComponent(ViewGroupComponent)) {
                        return true;
                    }
                    return false;
                }

                if (item.getComponent(ViewGroupComponent)) {
                    return true;
                }
            }
        }
        return false;
    }

    private _startInertiaScroll (touchMoveVelocity: Vec3) {
        const inertiaTotalMovement = touchMoveVelocity.mul(MOVEMENT_FACTOR);
        this._startAttenuatingAutoScroll(inertiaTotalMovement, touchMoveVelocity);
    }

    private _calculateAttenuatedFactor (distance: number) {
        if (this.brake <= 0) {
            return (1 - this.brake);
        }

        // attenuate formula from: http://learnopengl.com/#!Lighting/Light-casters
        return (1 - this.brake) * (1 / (1 + distance * 0.000014 + distance * distance * 0.000000008));
    }

    private _startAttenuatingAutoScroll (deltaMove: Vec3, initialVelocity: Vec3) {
        let time = this._calculateAutoScrollTimeByInitalSpeed(initialVelocity.mag());

        let targetDelta = deltaMove.normalize();
        const contentSize = this._content!.getContentSize();
        const scrollviewSize = this.node.getContentSize();

        const totalMoveWidth = (contentSize.width - scrollviewSize.width);
        const totalMoveHeight = (contentSize.height - scrollviewSize.height);

        const attenuatedFactorX = this._calculateAttenuatedFactor(totalMoveWidth);
        const attenuatedFactorY = this._calculateAttenuatedFactor(totalMoveHeight);

        targetDelta = new Vec3(
            targetDelta.x * totalMoveWidth * (1 - this.brake) * attenuatedFactorX,
            targetDelta.y * totalMoveHeight * attenuatedFactorY * (1 - this.brake),
            0);

        const originalMoveLength = deltaMove.mag();
        let factor = targetDelta.mag() / originalMoveLength;
        targetDelta = targetDelta.add(deltaMove);

        if (this.brake > 0 && factor > 7) {
            factor = Math.sqrt(factor);
            targetDelta = deltaMove.mul(factor).add(deltaMove);
        }

        if (this.brake > 0 && factor > 3) {
            factor = 3;
            time = time * factor;
        }

        if (this.brake === 0 && factor > 1) {
            time = time * factor;
        }

        this._startAutoScroll(targetDelta, time, true);
    }

    private _calculateAutoScrollTimeByInitalSpeed (initalSpeed) {
        return Math.sqrt(Math.sqrt(initalSpeed / 5));
    }

    private _startAutoScroll (deltaMove: Vec3, timeInSecond: number, attenuated: boolean = false) {
        const adjustedDeltaMove = this._flattenVectorByDirection(deltaMove);

        this._autoScrolling = true;
        this._autoScrollTargetDelta = adjustedDeltaMove;
        this._autoScrollAttenuate = attenuated;
        vec3.copy(this._autoScrollStartPosition, this.getContentPosition());
        this._autoScrollTotalTime = timeInSecond;
        this._autoScrollAccumulatedTime = 0;
        this._autoScrollBraking = false;
        this._isScrollEndedWithThresholdEventFired = false;
        this._autoScrollBrakingStartPosition = new Vec3();

        const currentOutOfBoundary = this._getHowMuchOutOfBoundary();
        if (!currentOutOfBoundary.fuzzyEquals(ZERO, EPSILON)) {
            this._autoScrollCurrentlyOutOfBoundary = true;
        }
    }

    private _calculateTouchMoveVelocity () {
        let totalTime = 0;
        totalTime = this._touchMoveTimeDeltas.reduce((a, b) => {
            return a + b;
        }, totalTime);

        if (totalTime <= 0 || totalTime >= 0.5) {
            return new Vec3();
        }

        let totalMovement = new Vec3();
        totalMovement = this._touchMoveDisplacements.reduce((a, b) => {
            return a.add(b);
        }, totalMovement);

        return new Vec3(totalMovement.x * (1 - this.brake) / totalTime,
            totalMovement.y * (1 - this.brake) / totalTime, 0);
    }

    private _flattenVectorByDirection (vector: Vec3) {
        const result = vector;
        result.x = this.horizontal ? result.x : 0;
        result.y = this.vertical ? result.y : 0;
        return result;
    }

    private _moveContent (deltaMove: Vec3, canStartBounceBack?: boolean) {
        const adjustedMove = this._flattenVectorByDirection(deltaMove);
        this.getContentPosition().add(adjustedMove, _tempPos);

        this.setContentPosition(_tempPos);

        const outOfBoundary = this._getHowMuchOutOfBoundary();
        this._updateScrollBar(outOfBoundary);

        if (this.elastic && canStartBounceBack) {
            this._startBounceBackIfNeeded();
        }
    }

    private _getContentLeftBoundary () {
        const contentPos = this.getContentPosition();
        return contentPos.x - this._content!.getAnchorPoint().x * this._content!.getContentSize().width;
    }

    private _getContentRightBoundary () {
        const contentSize = this._content!.getContentSize();
        return this._getContentLeftBoundary() + contentSize.width;
    }

    private _getContentTopBoundary () {
        const contentSize = this._content!.getContentSize();
        return this._getContentBottomBoundary() + contentSize.height;
    }

    private _getContentBottomBoundary () {
        const contentPos = this.getContentPosition();
        return contentPos.y - this._content!.getAnchorPoint().y * this._content!.getContentSize().height;
    }

    private _getHowMuchOutOfBoundary (addition?: Vec3) {
        addition = addition || new Vec3();
        if (addition.fuzzyEquals(ZERO, EPSILON) && !this._outOfBoundaryAmountDirty) {
            return this._outOfBoundaryAmount;
        }

        let outOfBoundaryAmount = new Vec3();
        if (this._getContentLeftBoundary() + addition.x > this._leftBoundary) {
            outOfBoundaryAmount.x = this._leftBoundary - (this._getContentLeftBoundary() + addition.x);
        } else if (this._getContentRightBoundary() + addition.x < this._rightBoundary) {
            outOfBoundaryAmount.x = this._rightBoundary - (this._getContentRightBoundary() + addition.x);
        }

        if (this._getContentTopBoundary() + addition.y < this._topBoundary) {
            outOfBoundaryAmount.y = this._topBoundary - (this._getContentTopBoundary() + addition.y);
        } else if (this._getContentBottomBoundary() + addition.y > this._bottomBoundary) {
            outOfBoundaryAmount.y = this._bottomBoundary - (this._getContentBottomBoundary() + addition.y);
        }

        if (addition.fuzzyEquals(ZERO, EPSILON)) {
            this._outOfBoundaryAmount = outOfBoundaryAmount;
            this._outOfBoundaryAmountDirty = false;
        }

        outOfBoundaryAmount = this._clampDelta(outOfBoundaryAmount);
        return outOfBoundaryAmount;
    }

    private _updateScrollBar (outOfBoundary: Vec3) {
        if (this._horizontalScrollBar) {
            this._horizontalScrollBar.onScroll(outOfBoundary);
        }

        if (this.verticalScrollBar) {
            this.verticalScrollBar.onScroll(outOfBoundary);
        }
    }

    private _onScrollBarTouchBegan () {
        if (this._horizontalScrollBar) {
            this._horizontalScrollBar.onTouchBegan();
        }

        if (this.verticalScrollBar) {
            this.verticalScrollBar.onTouchBegan();
        }
    }

    private _onScrollBarTouchEnded () {
        if (this._horizontalScrollBar) {
            this._horizontalScrollBar.onTouchEnded();
        }

        if (this.verticalScrollBar) {
            this.verticalScrollBar.onTouchEnded();
        }
    }

    private _dispatchEvent (event) {
        if (event === 'scroll-ended') {
            this._scrollEventEmitMask = 0;

        } else if (event === 'scroll-to-top'
            || event === 'scroll-to-bottom'
            || event === 'scroll-to-left'
            || event === 'scroll-to-right') {

            const flag = (1 << eventMap[event]);
            if (this._scrollEventEmitMask & flag) {
                return;
            } else {
                this._scrollEventEmitMask |= flag;
            }
        }

        cc.Component.EventHandler.emitEvents(this.scrollEvents, this, eventMap[event]);
        this.node.emit(event, this);
    }

    private _adjustContentOutOfBoundary () {
        if (!this._content){
            return;
        }

        this._outOfBoundaryAmountDirty = true;
        if (this._isOutOfBoundary()) {
            const outOfBoundary = this._getHowMuchOutOfBoundary(new Vec3());
            const newPosition = this.getContentPosition().add(outOfBoundary);
            if (this._content) {
                this._content.setPosition(newPosition);
                // this._updateScrollBar(0);
                this._updateScrollBar(ZERO);
            }
        }
    }

    private _hideScrollbar () {
        if (this._horizontalScrollBar) {
            this._horizontalScrollBar.hide();
        }

        if (this.verticalScrollBar) {
            this.verticalScrollBar.hide();
        }
    }

    private _showScrollbar () {
        if (this._horizontalScrollBar) {
            this._horizontalScrollBar.show();
        }

        if (this.verticalScrollBar) {
            this.verticalScrollBar.show();
        }
    }

    // This is for Scrollview as children of a Button
    private _stopPropagationIfTargetIsMe (event?: Event) {
        if (event && event.eventPhase === cc.Event.AT_TARGET && event.target === this.node) {
            event.propagationStopped = true;
        }
    }

    private _processDeltaMove (deltaMove: Vec3) {
        this._scrollChildren(deltaMove);
        this._gatherTouchMove(deltaMove);
    }

    private _handleMoveLogic (touch: Touch) {
        const delta = touch.getUIDelta();
        vec3.set(this._deltaPos, delta.x, delta.y, 0);
        this._processDeltaMove(this._deltaPos);
    }

    private _scrollChildren (deltaMove: Vec3) {
        deltaMove = this._clampDelta(deltaMove);

        let realMove = deltaMove;
        let outOfBoundary;
        if (this.elastic) {
            outOfBoundary = this._getHowMuchOutOfBoundary();
            realMove.x *= (outOfBoundary.x === 0 ? 1 : 0.5);
            realMove.y *= (outOfBoundary.y === 0 ? 1 : 0.5);
        }

        if (!this.elastic) {
            outOfBoundary = this._getHowMuchOutOfBoundary(realMove);
            realMove = realMove.add(outOfBoundary);
        }

        let scrollEventType = '';
        const pos = new Vec3();
        this._content!.getPosition(pos);

        if (realMove.y > 0) { // up
            const icBottomPos = pos.y - this._content!.anchorY * this._content!.height;

            if (icBottomPos + realMove.y > this._bottomBoundary) {
                scrollEventType = 'scroll-to-bottom';
            }
        }
        else if (realMove.y < 0) { // down
            const icTopPos = pos.y - this._content!.anchorY * this._content!.height + this._content!.height;

            if (icTopPos + realMove.y <= this._topBoundary) {
                scrollEventType = 'scroll-to-top';
            }
        }
        else if (realMove.x < 0) { // left
            const icRightPos = pos.x - this._content!.anchorX * this._content!.width + this._content!.width;
            if (icRightPos + realMove.x <= this._rightBoundary) {
                scrollEventType = 'scroll-to-right';
            }
        }
        else if (realMove.x > 0) { // right
            const icLeftPos = pos.x - this._content!.anchorX * this._content!.width;
            if (icLeftPos + realMove.x >= this._leftBoundary) {
                scrollEventType = 'scroll-to-left';
            }
        }

        this._moveContent(realMove, false);

        if (realMove.x !== 0 || realMove.y !== 0) {
            if (!this._scrolling) {
                this._scrolling = true;
                this._dispatchEvent('scroll-began');
            }
            this._dispatchEvent('scrolling');
        }

        if (scrollEventType.length > 0) {
            this._dispatchEvent(scrollEventType);
        }

    }

    private _handlePressLogic () {
        if (this._autoScrolling) {
            this._dispatchEvent('scroll-ended');
        }
        this._autoScrolling = false;
        this._isBouncing = false;

        this._touchMovePreviousTimestamp = getTimeInMilliseconds();
        this._touchMoveDisplacements.length = 0;
        this._touchMoveTimeDeltas.length = 0;

        this._onScrollBarTouchBegan();
    }

    private _clampDelta (delta: Vec3) {
        const contentSize = this._content!.getContentSize();
        const scrollViewSize = this.node.getContentSize();
        if (contentSize.width < scrollViewSize.width) {
            delta.x = 0;
        }
        if (contentSize.height < scrollViewSize.height) {
            delta.y = 0;
        }

        return delta;
    }

    private _gatherTouchMove (delta: Vec3) {
        delta = this._clampDelta(delta);

        while (this._touchMoveDisplacements.length >= NUMBER_OF_GATHERED_TOUCHES_FOR_MOVE_SPEED) {
            this._touchMoveDisplacements.shift();
            this._touchMoveTimeDeltas.shift();
        }

        this._touchMoveDisplacements.push(delta);

        const timeStamp = getTimeInMilliseconds();
        this._touchMoveTimeDeltas.push((timeStamp - this._touchMovePreviousTimestamp) / 1000);
        this._touchMovePreviousTimestamp = timeStamp;
    }

    private _startBounceBackIfNeeded () {
        if (!this.elastic) {
            return false;
        }

        let bounceBackAmount = this._getHowMuchOutOfBoundary();
        bounceBackAmount = this._clampDelta(bounceBackAmount);

        if (bounceBackAmount.fuzzyEquals(_tempPos, EPSILON)) {
            return false;
        }

        const bounceBackTime = Math.max(this.bounceDuration, 0);
        this._startAutoScroll(bounceBackAmount, bounceBackTime, true);

        if (!this._isBouncing) {
            if (bounceBackAmount.y > 0) { this._dispatchEvent('bounce-top'); }
            if (bounceBackAmount.y < 0) { this._dispatchEvent('bounce-bottom'); }
            if (bounceBackAmount.x > 0) { this._dispatchEvent('bounce-right'); }
            if (bounceBackAmount.x < 0) { this._dispatchEvent('bounce-left'); }
            this._isBouncing = true;
        }

        return true;
    }

    private _processInertiaScroll () {
        const bounceBackStarted = this._startBounceBackIfNeeded();
        if (!bounceBackStarted && this.inertia) {
            const touchMoveVelocity = this._calculateTouchMoveVelocity();
            if (!touchMoveVelocity.fuzzyEquals(_tempPos, EPSILON) && this.brake < 1) {
                this._startInertiaScroll(touchMoveVelocity);
            }
        }

        this._onScrollBarTouchEnded();
    }

    private _handleReleaseLogic (touch) {
        const delta = touch.getUIDelta();
        vec3.set(this._deltaPos, delta.x, delta.y, 0);
        this._gatherTouchMove(this._deltaPos);
        this._processInertiaScroll();

        if (this._scrolling) {
            this._scrolling = false;
            if (!this._autoScrolling) {
                this._dispatchEvent('scroll-ended');
            }
        }
    }

    private _isOutOfBoundary () {
        const outOfBoundary = this._getHowMuchOutOfBoundary();
        return !outOfBoundary.fuzzyEquals(ZERO, EPSILON);
    }

    private _isNecessaryAutoScrollBrake () {
        if (this._autoScrollBraking) {
            return true;
        }

        if (this._isOutOfBoundary()) {
            if (!this._autoScrollCurrentlyOutOfBoundary) {
                this._autoScrollCurrentlyOutOfBoundary = true;
                this._autoScrollBraking = true;
                this._autoScrollBrakingStartPosition = this.getContentPosition();
                return true;
            }

        } else {
            this._autoScrollCurrentlyOutOfBoundary = false;
        }

        return false;
    }

    private _processAutoScrolling (dt) {
        const isAutoScrollBrake = this._isNecessaryAutoScrollBrake();
        const brakingFactor = isAutoScrollBrake ? OUT_OF_BOUNDARY_BREAKING_FACTOR : 1;
        this._autoScrollAccumulatedTime += dt * (1 / brakingFactor);

        let percentage = Math.min(1, this._autoScrollAccumulatedTime / this._autoScrollTotalTime);
        if (this._autoScrollAttenuate) {
            percentage = quintEaseOut(percentage);
        }

        let newPosition = this._autoScrollStartPosition.add(this._autoScrollTargetDelta.mul(percentage));
        let reachedEnd = Math.abs(percentage - 1) <= EPSILON;

        const fireEvent = Math.abs(percentage - 1) <= this.getScrollEndedEventTiming();
        if (fireEvent && !this._isScrollEndedWithThresholdEventFired) {
            this._dispatchEvent('scroll-ended-with-threshold');
            this._isScrollEndedWithThresholdEventFired = true;
        }

        if (this.elastic) {
            let brakeOffsetPosition = newPosition.sub(this._autoScrollBrakingStartPosition);
            if (isAutoScrollBrake) {
                brakeOffsetPosition = brakeOffsetPosition.mul(brakingFactor);
            }
            newPosition = this._autoScrollBrakingStartPosition.add(brakeOffsetPosition);
        } else {
            const moveDelta = newPosition.sub(this.getContentPosition());
            const outOfBoundary = this._getHowMuchOutOfBoundary(moveDelta);
            if (!outOfBoundary.fuzzyEquals(ZERO, EPSILON)) {
                newPosition = newPosition.add(outOfBoundary);
                reachedEnd = true;
            }
        }

        if (reachedEnd) {
            this._autoScrolling = false;
        }

        const deltaMove = newPosition.sub(this.getContentPosition());
        this._moveContent(this._clampDelta(deltaMove), reachedEnd);
        this._dispatchEvent('scrolling');

        if (!this._autoScrolling) {
            this._isBouncing = false;
            this._scrolling = false;
            this._dispatchEvent('scroll-ended');
        }
    }

    private _checkMouseWheel (dt: number) {
        const currentOutOfBoundary = this._getHowMuchOutOfBoundary();
        const maxElapsedTime = 0.1;

        if (!currentOutOfBoundary.fuzzyEquals(ZERO, EPSILON)) {
            this._processInertiaScroll();
            this.unschedule(this._checkMouseWheel);
            this._stopMouseWheel = false;
            return;
        }

        this._mouseWheelEventElapsedTime += dt;

        // mouse wheel event is ended
        if (this._mouseWheelEventElapsedTime > maxElapsedTime) {
            this._onScrollBarTouchEnded();
            this.unschedule(this._checkMouseWheel);
            this._stopMouseWheel = false;
        }
    }

    private _calculateMovePercentDelta (options) {
        let anchor = options.anchor;
        const applyToHorizontal = options.applyToHorizontal;
        const applyToVertical = options.applyToVertical;
        this._calculateBoundary();

        anchor = anchor.clampf(new Vec2(0, 0), new Vec2(1, 1));

        const scrollSize = this.node.getContentSize();
        const contentSize = this._content!.getContentSize();
        let bottomDeta = this._getContentBottomBoundary() - this._bottomBoundary;
        bottomDeta = -bottomDeta;

        let leftDeta = this._getContentLeftBoundary() - this._leftBoundary;
        leftDeta = -leftDeta;

        const moveDelta = new Vec3();
        let totalScrollDelta = 0;
        if (applyToHorizontal) {
            totalScrollDelta = contentSize.width - scrollSize.width;
            moveDelta.x = leftDeta - totalScrollDelta * anchor.x;
        }

        if (applyToVertical) {
            totalScrollDelta = contentSize.height - scrollSize.height;
            moveDelta.y = bottomDeta - totalScrollDelta * anchor.y;
        }

        return moveDelta;
    }

    /**
     * @zh
     *
     *
     * @param scrollViewSize - 可视区域尺寸。
     */
    private _moveContentToTopLeft (scrollViewSize: Size) {
        const contentSize = this._content!.getContentSize();

        let bottomDeta = this._getContentBottomBoundary() - this._bottomBoundary;
        bottomDeta = -bottomDeta;
        const moveDelta = new Vec3();
        let totalScrollDelta = 0;

        let leftDeta = this._getContentLeftBoundary() - this._leftBoundary;
        leftDeta = -leftDeta;

        if (contentSize.height < scrollViewSize.height) {
            totalScrollDelta = contentSize.height - scrollViewSize.height;
            moveDelta.y = bottomDeta - totalScrollDelta;

            if (this.verticalScrollBar) {
                this.verticalScrollBar.hide();
            }
        } else {
            if (this.verticalScrollBar) {
                this.verticalScrollBar.show();
            }
        }

        if (contentSize.width < scrollViewSize.width) {
            totalScrollDelta = contentSize.width - scrollViewSize.width;
            moveDelta.x = leftDeta;

            if (this._horizontalScrollBar) {
                this._horizontalScrollBar.hide();
            }

        } else {
            if (this._horizontalScrollBar) {
                this._horizontalScrollBar.show();
            }
        }

        this._moveContent(moveDelta);
        this._adjustContentOutOfBoundary();
    }
}

cc.ScrollViewComponent = ScrollViewComponent;

/**
 * !#en
 * Note: This event is emitted from the node to which the component belongs.
 * @zh
 * 注意：此事件是从该组件所属的 Node 上面派发出来的，需要用 node.on 来监听。
 * @event scroll-to-top
 * @param {Event.EventCustom} event
 * @param {ScrollView} scrollView - The ScrollView component.
 */

/**
 * !#en
 * Note: This event is emitted from the node to which the component belongs.
 * @zh
 * 注意：此事件是从该组件所属的 Node 上面派发出来的，需要用 node.on 来监听。
 * @event scroll-to-bottom
 * @param {Event.EventCustom} event
 * @param {ScrollView} scrollView - The ScrollView component.
 */

/**
 * !#en
 * Note: This event is emitted from the node to which the component belongs.
 * @zh
 * 注意：此事件是从该组件所属的 Node 上面派发出来的，需要用 node.on 来监听。
 * @event scroll-to-left
 * @param {Event.EventCustom} event
 * @param {ScrollView} scrollView - The ScrollView component.
 */

/**
 * !#en
 * Note: This event is emitted from the node to which the component belongs.
 * @zh
 * 注意：此事件是从该组件所属的 Node 上面派发出来的，需要用 node.on 来监听。
 * @event scroll-to-right
 * @param {Event.EventCustom} event
 * @param {ScrollView} scrollView - The ScrollView component.
 */

/**
 * !#en
 * Note: This event is emitted from the node to which the component belongs.
 * @zh
 * 注意：此事件是从该组件所属的 Node 上面派发出来的，需要用 node.on 来监听。
 * @event scrolling
 * @param {Event.EventCustom} event
 * @param {ScrollView} scrollView - The ScrollView component.
 */

/**
 * !#en
 * Note: This event is emitted from the node to which the component belongs.
 * @zh
 * 注意：此事件是从该组件所属的 Node 上面派发出来的，需要用 node.on 来监听。
 * @event bounce-bottom
 * @param {Event.EventCustom} event
 * @param {ScrollView} scrollView - The ScrollView component.
 */

/**
 * !#en
 * Note: This event is emitted from the node to which the component belongs.
 * @zh
 * 注意：此事件是从该组件所属的 Node 上面派发出来的，需要用 node.on 来监听。
 * @event bounce-top
 * @param {Event.EventCustom} event
 * @param {ScrollView} scrollView - The ScrollView component.
 */

/**
 * !#en
 * Note: This event is emitted from the node to which the component belongs.
 * @zh
 * 注意：此事件是从该组件所属的 Node 上面派发出来的，需要用 node.on 来监听。
 * @event bounce-left
 * @param {Event.EventCustom} event
 * @param {ScrollView} scrollView - The ScrollView component.
 */

/**
 * !#en
 * Note: This event is emitted from the node to which the component belongs.
 * @zh
 * 注意：此事件是从该组件所属的 Node 上面派发出来的，需要用 node.on 来监听。
 * @event bounce-right
 * @param {Event.EventCustom} event
 * @param {ScrollView} scrollView - The ScrollView component.
 */

/**
 * !#en
 * Note: This event is emitted from the node to which the component belongs.
 * @zh
 * 注意：此事件是从该组件所属的 Node 上面派发出来的，需要用 node.on 来监听。
 * @event scroll-ended
 * @param {Event.EventCustom} event
 * @param {ScrollView} scrollView - The ScrollView component.
 */

/**
 * !#en
 * Note: This event is emitted from the node to which the component belongs.
 * @zh
 * 注意：此事件是从该组件所属的 Node 上面派发出来的，需要用 node.on 来监听。
 * @event touch-up
 * @param {Event.EventCustom} event
 * @param {ScrollView} scrollView - The ScrollView component.
 */

/**
 * !#en
 * Note: This event is emitted from the node to which the component belongs.
 * @zh
 * 注意：此事件是从该组件所属的 Node 上面派发出来的，需要用 node.on 来监听。
 * @event scroll-began
 * @param {Event.EventCustom} event
 * @param {ScrollView} scrollView - The ScrollView component.
 */
