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
import { _decorator } from '../../../core/data/index';
const { ccclass } = _decorator;
import { AudioClip, AudioType } from './clip';
import { PlayingState } from './player';

/**
 * WeChat audio to port. https://developers.weixin.qq.com/minigame/dev/document/media/audio/InnerAudioContext.html
 */
@ccclass('cc.WxGameAudioClip')
export default class WxGameAudioClip extends AudioClip {
    private _volume: number;
    private _loop: boolean;
    private _oneShoting: boolean;
    private _currentTime: number;
    private _state = PlayingState.STOPPED;
    constructor () {
        super();
        this._loadMode = AudioType.WX_GAME_AUDIO;
        this._volume = 1;
        this._loop = false;
        this._oneShoting = false;
        this._currentTime = 0.0;
    }

    public setNativeAsset (clip, info) {
        // typeof clip === innerAudioContext
        if (!clip) {
            console.warn('There is no audio in the current clip');
            return;
        }

        super.setNativeAsset(clip, info);
        this._initEventsListener();
        clip.volume = this._volume;
        clip.loop = this._loop;
    }

    public _initEventsListener () {
        this._audio.onPlay(() => {
            this._state = PlayingState.PLAYING;
            this._currentTime = this._audio.currentTime;
            // @ts-ignore
            this.emit('started');
        });

        this._audio.onPause(() => {
            this._state = PlayingState.STOPPED;
            this._oneShoting = false;
        });

        this._audio.onStop(() => {
            this._state = PlayingState.STOPPED;
            this._oneShoting = false;
            this._currentTime = 0;
        });

        this._audio.onEnded(() => {
            this._state = PlayingState.STOPPED;
            this._currentTime = 0;
            // @ts-ignore
            this.emit('ended');
            if (this._oneShoting) {
                this._audio.volume = this._volume;
                this._audio.loop = this._loop;
                this._oneShoting = false;
            }
        });
    }

    public play () {
        if (!this._audio || this._state === PlayingState.PLAYING) {
            return;
        }

        this._audio.play();
    }

    public pause () {
        if (this._state !== PlayingState.PLAYING) {
            return;
        }

        this._audio.pause();
    }

    public stop () {
        if (this._state === PlayingState.STOPPED) {
            return;
        }

        this._audio.stop();
    }

    public playOneShot (volume = 1) {
        /* HTMLMediaElement doesn't support multiple playback at the
           same time so here we fall back to re-start style cc.gameroach */
        if (!this._audio) { return; }
        this._audio.volume = volume;
        if (this._oneShoting) { return; }
        this._audio.loop = false;
        this._oneShoting = true;
        this._audio.play();
    }

    public getCurrentTime () {
        return this._currentTime;
    }

    public setCurrentTime (val) {
        this._currentTime = val;
        this._audio.seek(this._currentTime);
    }

    public getDuration () {
        return this._audio ? this._audio.duration : 0;
    }

    public getVolume () {
        return this._audio ? this._audio.volume : this._volume;
    }

    public setVolume (val) {
        this._volume = val;
        if (this._audio) { this._audio.volume = val; }
    }

    public getLoop () {
        return this._loop;
    }

    public setLoop (val) {
        this._loop = val;
        if (this._audio) { this._audio.loop = val; }
    }
}

cc.WxGameAudioClip = WxGameAudioClip;
