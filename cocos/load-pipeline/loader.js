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

import {mixin} from '../core/utils/js';
import {ImageAsset} from '../assets/image-asset';
import plistParser from './plist-parser';
import Pipeline from './pipeline';
import {loadUuid} from './uuid-loader';
import {loadFont} from './font-loader';

function loadNothing () {
    return null;
}

function loadJSON (item) {
    if (typeof item.content !== 'string') {
        return new Error('JSON Loader: Input item doesn\'t contain string content');
    }

    try {
        var result = JSON.parse(item.content);
        return result;
    }
    catch (e) {
        return new Error('JSON Loader: Parse json [' + item.id + '] failed : ' + e);
    }
}

function loadImage (item) {
    var loadByDeserializedAsset = (item._owner instanceof cc.Asset);
    if (loadByDeserializedAsset) {
        // already has cc.Asset
        return null;
    }

    var image = item.content;
    if (!CC_WECHATGAME && !CC_QQPLAY && !(image instanceof Image)) {
        return new Error('Image Loader: Input item doesn\'t contain Image content');
    }

    // load cc.ImageAsset
    var rawUrl = item.rawUrl;
    var imageAsset = item.texture || new ImageAsset();
    imageAsset._uuid = item.uuid;
    imageAsset.url = rawUrl;
    imageAsset._setRawAsset(rawUrl, false);
    imageAsset._nativeAsset = image;
    return imageAsset;
}

// If audio is loaded by url directly, than this loader will wrap it into a new cc.AudioClip object.
// If audio is loaded by deserialized AudioClip, than this loader will be skipped.
function loadAudioAsAsset (item, callback) {
    var loadByDeserializedAsset = (item._owner instanceof cc.Asset);
    if (loadByDeserializedAsset) {
        // already has cc.Asset
        return null;
    }

    var audioClip = new cc.AudioClip();
    audioClip._setRawAsset(item.rawUrl, false);
    audioClip._nativeAsset = item.content;
    return audioClip;
}

function loadPlist (item) {
    if (typeof item.content !== 'string') {
        return new Error('Plist Loader: Input item doesn\'t contain string content');
    }
    var result = plistParser.parse(item.content);
    if (result) {
        return result;
    }
    else {
        return new Error('Plist Loader: Parse [' + item.id + '] failed');
    }
}

function loadBinary (item) {
    // Invoke custom handle
    if (item.load) {
        return item.load(item.content);
    }
    else {
        return item.content;
    }
}

//===============//
// PVR constants //
//===============//
// https://github.com/toji/texture-tester/blob/master/js/webgl-texture-util.js#L424
const PVR_HEADER_LENGTH = 13; // The header length in 32 bit ints.
const PVR_MAGIC = 0x03525650; //0x50565203;

// Offsets into the header array.
const PVR_HEADER_MAGIC = 0;
const PVR_HEADER_FORMAT = 2;
const PVR_HEADER_HEIGHT = 6;
const PVR_HEADER_WIDTH = 7;
const PVR_HEADER_MIPMAPCOUNT = 11;
const PVR_HEADER_METADATA = 12;

function loadPVRTex (item) {
    let buffer = item.content instanceof ArrayBuffer ? item.content : item.content.buffer;
    // Get a view of the arrayBuffer that represents the DDS header.
    let header = new Int32Array(buffer, 0, PVR_HEADER_LENGTH);

    // Do some sanity checks to make sure this is a valid DDS file.
    if(header[PVR_HEADER_MAGIC] === PVR_MAGIC) {
      // Gather other basic metrics and a view of the raw the DXT data.
        let width = header[PVR_HEADER_WIDTH];
        let height = header[PVR_HEADER_HEIGHT];
        let dataOffset = header[PVR_HEADER_METADATA] + 52;
        // todo: use new Uint8Array(buffer, dataOffset) instead
        buffer = buffer.slice(dataOffset, buffer.byteLength);
        let pvrtcData = new Uint8Array(buffer);
        let pvrAsset = {
            _data: pvrtcData,
            _compressed: true,
            width: width,
            height: height,
        };
        return pvrAsset;
    }
    else if (header[11] === 0x21525650) {
        var headerLength = header[0],
		height = header[1],
        width = header[2]
        // todo: use new Uint8Array(buffer, headerLength) instead
        buffer = buffer.slice(headerLength, buffer.byteLength);
        let pvrtcData = new Uint8Array(buffer);
        let pvrAsset = {
            _data: pvrtcData,
            _compressed: true,
            width: width,
            height: height,
        };
        return pvrAsset;
    }
    else {
        return new Error("Invalid magic number in PVR header");
    }
}

//===============//
// ETC constants //
//===============//

const ETC_PKM_HEADER_SIZE = 16;

const ETC_PKM_FORMAT_OFFSET = 6;
const ETC_PKM_ENCODED_WIDTH_OFFSET = 8;
const ETC_PKM_ENCODED_HEIGHT_OFFSET = 10;
const ETC_PKM_WIDTH_OFFSET = 12;
const ETC_PKM_HEIGHT_OFFSET = 14;

const ETC1_RGB_NO_MIPMAPS   = 0;
const ETC2_RGB_NO_MIPMAPS   = 1;
const ETC2_RGBA_NO_MIPMAPS  = 3;


function readBEUint16(header, offset) {
    return (header[offset] << 8) | header[offset+1];
}
function loadPKMTex(item) {
    let buffer = item.content instanceof ArrayBuffer ? item.content : item.content.buffer;
    let header = new Uint8Array(buffer);
    let format = readBEUint16(header, ETC_PKM_FORMAT_OFFSET);
    if (format !== ETC1_RGB_NO_MIPMAPS && format !== ETC2_RGB_NO_MIPMAPS && format !== ETC2_RGBA_NO_MIPMAPS) {
        return new Error("Invalid magic number in ETC header");
    }
    let width = readBEUint16(header, ETC_PKM_WIDTH_OFFSET);
    let height = readBEUint16(header, ETC_PKM_HEIGHT_OFFSET);
    let encodedWidth = readBEUint16(header, ETC_PKM_ENCODED_WIDTH_OFFSET);
    let encodedHeight = readBEUint16(header, ETC_PKM_ENCODED_HEIGHT_OFFSET);
    // todo: use new Uint8Array(buffer, ETC_PKM_HEADER_SIZE) instead
    buffer = buffer.slice(ETC_PKM_HEADER_SIZE, buffer.byteLength);
    let etcData = new Uint8Array(buffer);
    
    let etcAsset = {
        _data: etcData,
        _compressed: true,
        width: width,
        height: height
    };
    return etcAsset;
}

var defaultMap = {
    // Images
    'png' : loadImage,
    'jpg' : loadImage,
    'bmp' : loadImage,
    'jpeg' : loadImage,
    'gif' : loadImage,
    'ico' : loadImage,
    'tiff' : loadImage,
    'webp' : loadImage,
    'image' : loadImage,
    'pvr' : loadPVRTex,
    'pkm' : loadPKMTex,

    // Audio
    'mp3' : loadAudioAsAsset,
    'ogg' : loadAudioAsAsset,
    'wav' : loadAudioAsAsset,
    'm4a' : loadAudioAsAsset,

    // json
    'json' : loadJSON,
    'ExportJson' : loadJSON,

    // plist
    'plist' : loadPlist,

    // asset
    'uuid' : loadUuid,
    'prefab' : loadUuid,
    'fire' : loadUuid,
    'scene' : loadUuid,

    // binary
    'binary' : loadBinary,
    'bin': loadBinary,

    // Font
    'font' : loadFont,
    'eot' : loadFont,
    'ttf' : loadFont,
    'woff' : loadFont,
    'svg' : loadFont,
    'ttc' : loadFont,

    'default' : loadNothing
};

var ID = 'Loader';

/**
 * The loader pipe, it can load several types of files:
 * 1. Images
 * 2. JSON
 * 3. Plist
 * 4. Audio
 * 5. Font
 * 6. Cocos Creator scene
 * It will not interfere with items of unknown type.
 * You can pass custom supported types in the constructor.
 * @class Pipeline.Loader
 */
/**
 * Constructor of Loader, you can pass custom supported types.
 *
 * @method constructor
 * @param {Object} extMap Custom supported types with corresponded handler
 * @example
 *var loader = new Loader({
 *    // This will match all url with `.scene` extension or all url with `scene` type
 *    'scene' : function (url, callback) {}
 *});
 */
export default class Loader {
    static ID = ID;

    constructor (extMap) {
        this.id = ID;
        this.async = true;
        this.pipeline = null;

        this.extMap = mixin(extMap, defaultMap);
    }

    /**
     * Add custom supported types handler or modify existing type handler.
     * @method addHandlers
     * @param {Object} extMap Custom supported types with corresponded handler
     */
    addHandlers (extMap) {
        this.extMap = mixin(this.extMap, extMap);
    }

    handle (item, callback) {
        var loadFunc = this.extMap[item.type] || this.extMap['default'];
        return loadFunc.call(this, item, callback);
    }
}

Pipeline.Loader = Loader;
