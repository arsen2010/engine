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

import { SpriteFrame } from '../../../../assets';
import { Component } from '../../../../components';
import { fragmentText, safeMeasureText } from '../../../../core/utils';
import { Color, Size } from '../../../../core/value-types';
import { HorizontalTextAlignment, LabelComponent, LabelOutlineComponent, VerticalTextAlignment } from '../../components';
import { CanvasPool, ISharedLabelData } from './font-utils';
import { LetterRenderTexture } from './letter-font';

const Overflow = LabelComponent.Overflow;
const WHITE = Color.WHITE;
const OUTLINE_SUPPORTED = cc.js.isChildClassOf(LabelOutlineComponent, Component);

let _context: CanvasRenderingContext2D | null = null;
let _canvas: HTMLCanvasElement | null = null;
let _texture: SpriteFrame | LetterRenderTexture | null = null;

let _fontDesc = '';
let _string = '';
let _fontSize = 0;
let _drawFontsize = 0;
let _splitedStrings: string[] = [];
const _canvasSize = new Size();
let _lineHeight = 0;
let _hAlign = 0;
let _vAlign = 0;
let _color = new Color();
let _fontFamily = '';
let _overflow = Overflow.NONE;
let _isWrapText = false;

// outline
let _isOutlined = false;
let _outlineColor = new Color();
let _outlineWidth = 0;
let _margin = 0;

let _isBold = false;
let _isItalic = false;
let _isUnderline = false;

const _canvasPool = new CanvasPool();

// let _sharedLabelData;

export const ttfUtils =  {
    getAssemblerData () {
        // if (cc.game.renderType === cc.game.RENDER_TYPE_CANVAS) {
        //     _sharedLabelData = _canvasPool.get();
        // }
        // else {
        // if (!_sharedLabelData) {
        const labelCanvas = document.createElement('canvas');
        const sharedLabelData = {
            canvas: labelCanvas,
            context: labelCanvas.getContext('2d'),
        } as ISharedLabelData;
        // }
        // }
        sharedLabelData.canvas.width = sharedLabelData.canvas.height = 1;
        return sharedLabelData;
    },

    resetAssemblerData (assemblerData: ISharedLabelData) {
        if (cc.game.renderType === cc.game.RENDER_TYPE_CANVAS && assemblerData) {
            _canvasPool.put(assemblerData);
        }
    },

    updateRenderData (comp: LabelComponent) {
        if (!comp.renderData || !comp.renderData.vertDirty) { return; }

        this._updateFontFamly(comp);
        this._updateProperties(comp);
        this._calculateLabelFont();
        this._calculateSplitedStrings();
        this._updateLabelDimensions();
        this._calculateTextBaseline();
        this._updateTexture();

        comp.actualFontSize = _fontSize;
        comp.node.setContentSize(_canvasSize);

        this.updateVerts(comp);

        comp.markForUpdateRenderData(false);

        _context = null;
        _canvas = null;
        _texture = null;
    },

    updateVerts (comp: LabelComponent) {
    },

    _updateFontFamly (comp: LabelComponent) {
        if (!comp.useSystemFont) {
            if (comp.font) {
                if (comp.font._nativeAsset) {
                    _fontFamily = comp.font._nativeAsset;
                }
                else {
                    cc.loader.load(comp.font.nativeUrl, (err, fontFamily) => {
                        _fontFamily = fontFamily || 'Arial';
                        comp.updateRenderData(true);
                    });
                }
            }
            else {
                _fontFamily = 'Arial';
            }
        }
        else {
            _fontFamily = comp.fontFamily;
        }
    },

    _updateProperties (comp: LabelComponent) {
        const assemblerData = comp.assemblerData;
        if (!assemblerData){
            return;
        }

        _context = assemblerData.context;
        _canvas = assemblerData.canvas;
        _texture = comp.spriteFrame;

        _string = comp.string.toString();
        _fontSize = comp.fontSize;
        _drawFontsize = _fontSize;
        _overflow = comp.overflow;
        _canvasSize.width = comp.node.width!;
        _canvasSize.height = comp.node.height!;
        _lineHeight = comp.lineHeight;
        _hAlign = comp.horizontalAlign;
        _vAlign = comp.verticalAlign;
        _color = comp.color;
        _isBold = comp.isBold;
        _isItalic = comp.isItalic;
        _isUnderline = comp.isUnderline;

        if (_overflow === Overflow.NONE) {
            _isWrapText = false;
        }
        else if (_overflow === Overflow.RESIZE_HEIGHT) {
            _isWrapText = true;
        }
        else {
            _isWrapText = comp.enableWrapText;
        }

        // outline
        const outline = OUTLINE_SUPPORTED && comp.getComponent(LabelOutlineComponent);
        if (outline && outline.enabled) {
            _isOutlined = true;
            _margin = _outlineWidth = outline.width;
            _outlineColor = outline.color.clone();
            // TODO: temporary solution, cascade opacity for outline color
            _outlineColor.a = _outlineColor.a * comp.color.a / 255.0;
        }
        else {
            _isOutlined = false;
            _margin = 0;
        }
    },

    _calculateFillTextStartPosition () {
        const lineHeight = this._getLineHeight();
        const lineCount = _splitedStrings.length;
        let labelX;
        let firstLinelabelY;

        if (_hAlign === HorizontalTextAlignment.RIGHT) {
            labelX = _canvasSize.width - _margin;
        }
        else if (_hAlign === HorizontalTextAlignment.CENTER) {
            labelX = _canvasSize.width / 2;
        }
        else {
            labelX = 0 + _margin;
        }

        if (_vAlign === VerticalTextAlignment.TOP) {
            firstLinelabelY = 0;
        }
        else if (_vAlign === VerticalTextAlignment.CENTER) {
            firstLinelabelY = _canvasSize.height / 2 - lineHeight * (lineCount - 1) / 2;
        }
        else {
            firstLinelabelY = _canvasSize.height - lineHeight * (lineCount - 1);
        }

        return cc.v2(labelX, firstLinelabelY);
    },

    _updateTexture () {
        if (!_context || !_canvas){
            return;
        }

        _context.clearRect(0, 0, _canvas.width, _canvas.height);
        _context.font = _fontDesc;

        const startPosition = this._calculateFillTextStartPosition();
        const lineHeight = this._getLineHeight();
        // use round for line join to avoid sharp intersect point
        _context.lineJoin = 'round';
        _context.fillStyle = `rgba(${_color.r}, ${_color.g}, ${_color.b}, ${_color.a / 255})`;
        let underlineStartPosition;

        // do real rendering
        for (let i = 0; i < _splitedStrings.length; ++i) {
            if (_isOutlined) {
                const strokeColor = _outlineColor || WHITE;
                _context.strokeStyle = `rgba(${strokeColor.r}, ${strokeColor.g}, ${strokeColor.b}, ${strokeColor.a / 255})`;
                _context.lineWidth = _outlineWidth * 2;
                _context.strokeText(_splitedStrings[i], startPosition.x, startPosition.y + i * lineHeight);
            }
            _context.fillText(_splitedStrings[i], startPosition.x, startPosition.y + i * lineHeight);

            if (_isUnderline) {
                underlineStartPosition = this._calculateUnderlineStartPosition();
                _context.save();
                _context.beginPath();
                _context.lineWidth = _fontSize / 8;
                _context.strokeStyle = `rgba(${_color.r}, ${_color.g}, ${_color.b}, ${_color.a / 255})`;
                _context.moveTo(underlineStartPosition.x, underlineStartPosition.y + i * lineHeight - 1);
                _context.lineTo(underlineStartPosition.x + _canvas.width, underlineStartPosition.y + i * lineHeight - 1);
                _context.stroke();
                _context.restore();
            }
        }

        // _texture.handleLoadedTexture();
        if (_texture) {
            _texture.mipmaps = [_texture.image!];
        }
    },

    _calculateUnderlineStartPosition () {
        const lineHeight = this._getLineHeight();
        const lineCount = _splitedStrings.length;
        let labelX;
        let firstLinelabelY;

        labelX = 0 + _margin;

        if (_vAlign === VerticalTextAlignment.TOP) {
            firstLinelabelY = _fontSize;
        }
        else if (_vAlign === VerticalTextAlignment.CENTER) {
            firstLinelabelY = _canvasSize.height / 2 - lineHeight * (lineCount - 1) / 2 + _fontSize / 2;
        }
        else {
            firstLinelabelY = _canvasSize.height - lineHeight * (lineCount - 1);
        }

        return cc.v2(labelX, firstLinelabelY);
    },

    _updateLabelDimensions () {
        if (!_context){
            return;
        }

        const paragraphedStrings = _string.split('\n');

        if (_overflow === Overflow.RESIZE_HEIGHT) {
            _canvasSize.height = _splitedStrings.length * this._getLineHeight();
        }
        else if (_overflow === Overflow.NONE) {
            _splitedStrings = paragraphedStrings;
            let canvasSizeX = 0;
            let canvasSizeY = 0;
            for (const para of paragraphedStrings) {
                const paraLength = safeMeasureText(_context, para);
                canvasSizeX = canvasSizeX > paraLength ? canvasSizeX : paraLength;
            }
            canvasSizeY = _splitedStrings.length * this._getLineHeight();

            _canvasSize.width = parseFloat(canvasSizeX.toFixed(2)) + 2 * _margin;
            _canvasSize.height = parseFloat(canvasSizeY.toFixed(2));
            if (_isItalic) {
                // 0.0174532925 = 3.141592653 / 180
                _canvasSize.width += _drawFontsize * Math.tan(12 * 0.0174532925);
            }
        }

        if (!_canvas){
            return;
        }

        _canvas.width = _canvasSize.width;
        _canvas.height = _canvasSize.height;
    },

    _calculateTextBaseline () {
        // let node = this._node;
        let hAlign;
        let vAlign;

        if (_hAlign === HorizontalTextAlignment.RIGHT) {
            hAlign = 'right';
        }
        else if (_hAlign === HorizontalTextAlignment.CENTER) {
            hAlign = 'center';
        }
        else {
            hAlign = 'left';
        }

        if (_vAlign === VerticalTextAlignment.TOP) {
            vAlign = 'top';
        }
        else if (_vAlign === VerticalTextAlignment.CENTER) {
            vAlign = 'middle';
        }
        else {
            vAlign = 'bottom';
        }

        if (_context) {
            _context.textAlign = hAlign;
            _context.textBaseline = vAlign;
        }
    },

    _calculateSplitedStrings () {
        if (!_context){
            return;
        }
        const paragraphedStrings = _string.split('\n');

        if (_isWrapText) {
            _splitedStrings = [];
            const canvasWidthNoMargin = _canvasSize.width - 2 * _margin;
            for (const para of paragraphedStrings) {
                const allWidth = safeMeasureText(_context, para);
                const textFragment = fragmentText(para, allWidth, canvasWidthNoMargin, this._measureText(_context!));
                _splitedStrings = _splitedStrings.concat(textFragment);
            }
        }
        else {
            _splitedStrings = paragraphedStrings;
        }

    },

    _getFontDesc () {
        let fontDesc = _fontSize.toString() + 'px ';
        fontDesc = fontDesc + _fontFamily;
        if (_isBold) {
            fontDesc = 'bold ' + fontDesc;
        }

        if (_isItalic) {
            fontDesc = 'italic ' + fontDesc;
        }

        return fontDesc;
    },

    _getLineHeight () {
        let nodeSpacingY = _lineHeight;
        if (nodeSpacingY === 0) {
            nodeSpacingY = _fontSize;
        } else {
            nodeSpacingY = nodeSpacingY * _fontSize / _drawFontsize;
        }

        return nodeSpacingY | 0;
    },

    _calculateParagraphLength (paragraphedStrings: string[], ctx: CanvasRenderingContext2D) {
        const paragraphLength: number[] = [];

        for (const para of paragraphedStrings) {
            const width: number = safeMeasureText(ctx, para);
            paragraphLength.push(width);
        }

        return paragraphLength;
    },

    _measureText (ctx: CanvasRenderingContext2D) {
        return (string: string) => {
            return safeMeasureText(ctx, string);
        };
    },

    _calculateLabelFont () {
        if (!_context){
            return;
        }

        _fontDesc = this._getFontDesc();
        _context.font = _fontDesc;

        if (_overflow === Overflow.SHRINK) {
            const paragraphedStrings = _string.split('\n');
            const paragraphLength = this._calculateParagraphLength(paragraphedStrings, _context);

            _splitedStrings = paragraphedStrings;
            let i = 0;
            let totalHeight = 0;
            let maxLength = 0;

            if (_isWrapText) {
                const canvasWidthNoMargin = _canvasSize.width - 2 * _margin;
                const canvasHeightNoMargin = _canvasSize.height - 2 * _margin;
                if (canvasWidthNoMargin < 0 || canvasHeightNoMargin < 0) {
                    _fontDesc = this._getFontDesc();
                    _context.font = _fontDesc;
                    return;
                }
                totalHeight = canvasHeightNoMargin + 1;
                maxLength = canvasWidthNoMargin + 1;
                let actualFontSize = _fontSize + 1;
                let textFragment: string[] = [];
                let tryDivideByTwo = true;
                let startShrinkFontSize = actualFontSize | 0;

                while (totalHeight > canvasHeightNoMargin || maxLength > canvasWidthNoMargin) {
                    if (tryDivideByTwo) {
                        actualFontSize = (startShrinkFontSize / 2) | 0;
                    } else {
                        actualFontSize = startShrinkFontSize - 1;
                        startShrinkFontSize = actualFontSize;
                    }
                    if (actualFontSize <= 0) {
                        cc.logID(4003);
                        break;
                    }
                    _fontSize = actualFontSize;
                    _fontDesc = this._getFontDesc();
                    _context.font = _fontDesc;

                    _splitedStrings = [];
                    totalHeight = 0;
                    for (i = 0; i < paragraphedStrings.length; ++i) {
                        let j = 0;
                        const allWidth = safeMeasureText(_context, paragraphedStrings[i]);
                        textFragment = fragmentText(paragraphedStrings[i],
                            allWidth,
                            canvasWidthNoMargin,
                            this._measureText(_context));
                        while (j < textFragment.length) {
                            const measureWidth = safeMeasureText(_context, textFragment[j]);
                            maxLength = measureWidth;
                            totalHeight += this._getLineHeight();
                            ++j;
                        }
                        _splitedStrings = _splitedStrings.concat(textFragment);
                    }

                    if (tryDivideByTwo) {
                        if (totalHeight > canvasHeightNoMargin) {
                            startShrinkFontSize = actualFontSize | 0;
                        } else {
                            tryDivideByTwo = false;
                            totalHeight = canvasHeightNoMargin + 1;
                        }
                    }
                }
            }
            else {
                totalHeight = paragraphedStrings.length * this._getLineHeight();

                for (i = 0; i < paragraphedStrings.length; ++i) {
                    if (maxLength < paragraphLength[i]) {
                        maxLength = paragraphLength[i];
                    }
                }
                const scaleX = (_canvasSize.width - 2 * _margin) / maxLength;
                const scaleY = _canvasSize.height / totalHeight;

                _fontSize = (_drawFontsize * Math.min(1, scaleX, scaleY)) | 0;
                _fontDesc = this._getFontDesc();
                _context.font = _fontDesc;
            }
        }
    },
};
