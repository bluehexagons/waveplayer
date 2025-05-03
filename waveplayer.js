(function () {
    'use strict';
    var audioCtx = new AudioContext(), BufferPlayer = (function () {
        var currentTime = {
            enumerable: true,
            configurable: false,
            get: function () {
                return this.paused ? this._currentTime : (Date.now() - this._startedTime) / 1000;
            },
            set: function (value) {
                if (this.paused) {
                    this._currentTime = value;
                }
                else {
                    this.pause();
                    this._currentTime = value;
                    this.play();
                }
                this.updateTime();
            }
        }, BufferPlayer = function BufferPlayer(buffer) {
            var that = this;
            this.listeners = {};
            this.paused = true;
            this.buffer = buffer;
            this.source = null;
            this._currentTime = 0;
            this._startedTime = 0;
            this._defaultEvent = { target: this };
            this.duration = buffer.duration;
            this._onended = function () {
                that.paused = true;
                that.source = null;
                that._currentTime = 0;
                that.dispatchEvent('ended');
            };
            this.updateTime = function () {
                that.dispatchEvent('timeupdate');
                if (!that.paused) {
                    requestAnimationFrame(that.updateTime);
                }
            };
            Object.defineProperty(this, 'currentTime', currentTime);
        };
        BufferPlayer.prototype.play = function () {
            if (this.paused) {
                this.source = audioCtx.createBufferSource();
                this.source.buffer = this.buffer;
                this.source.connect(audioCtx.destination);
                this._startedTime = Date.now() - this._currentTime * 1000;
                this.paused = false;
                this.source.start(0, this._currentTime);
                this.dispatchEvent('playing');
                this.updateTime();
            }
        };
        BufferPlayer.prototype.pause = function () {
            if (!this.paused) {
                this.source.stop();
                this.source = null;
                this.paused = true;
                this._currentTime = (Date.now() - this._startedTime) / 1000;
                this.dispatchEvent('pause');
            }
        };
        BufferPlayer.prototype.addEventListener = function (name, callback) {
            if (!this.listeners[name]) {
                this.listeners[name] = [];
            }
            this.listeners[name].push(callback);
        };
        BufferPlayer.prototype.removeEventListener = function (name, callback) {
            var index = this.listeners[name].indexOf(callback);
            if (index !== -1) {
                this.listeners[name].splice(index, 1);
            }
        };
        BufferPlayer.prototype.dispatchEvent = function (name, evt) {
            var i, listeners = this.listeners[name], l;
            if (listeners) {
                if (!evt) {
                    evt = this._defaultEvent;
                }
                l = listeners.length;
                for (i = 0; i < l; i++) {
                    listeners[i](evt);
                }
            }
        };
        return BufferPlayer;
    }()), WavePlayer = function WavePlayer(src, parent, options) {
        var key;
        this.src = src;
        this.element = null;
        this.parent = null;
        this.audio = null;
        this.canvas = null;
        this.overlay = null;
        this.ctx = null;
        this.overCtx = null;
        this.buffer = null;
        this.channel = null;
        this.source = null;
        this.maxes = null;
        this.mins = null;
        this.width = +0;
        this.height = +0;
        this.resolution = +1;
        this.scale = +1;
        this.ratio = +1;
        this.innerScale = +0.25;
        this.timeHeight = +14;
        this.mousedOver = false;
        this.light = 0 | 0;
        this.cursor = -1 | 0;
        this.lightColor = 'rgba(0, 0, 0, 0.7)';
        this.lightWidth = +2;
        this.lightBackgroundColor = '#fff';
        this.lightBackgroundWidth = +3;
        this.cursorColor = '#000';
        this.cursorWidth = +3;
        this.cursorBackgroundColor = '#fff';
        this.cursorBackgroundWidth = +4;
        this.lastTimeWidth = +0;
        this.strokeStyle = 'black';
        this.fillStyle = '#fc6';
        this.innerFillStyle = '#f93';
        this.tickStyle = '#444';
        this.midLineStyle = '#c70';
        this.lineWidth = +1;
        this.midLineWidth = +2;
        this.fontColor = 'white';
        this.timeBackgroundColor = 'rgba(0, 0, 0, 0.9)';
        this.loadingText = 'loading...';
        for (key in options) {
            this[key] = options[key];
        }
        this.renderPlaying = function () { };
        if (parent) {
            this.initialize(parent);
        }
    }, timeToText = (function () {
        var times = {};
        return function (time) {
            if (times[time]) {
                return times[time];
            }
            return times[time] = (time < 60 ? '0' : (time / 60 | 0)) + ':' + (time % 60 >= 10 ? time % 60 : '0' + time % 60);
        };
    }()), closureFunctions = function (player) {
        var overlay = player.overlay, audio = player.audio, renderPlaying = function () {
            var audio = player.audio;
            player.renderCursor(player.width * (audio.currentTime / audio.duration) | 0);
            if (!audio.paused) {
                requestAnimationFrame(renderPlaying);
            }
        }, keydown = function (e) {
            if (e.keyCode === 32) {
                if (audio.paused) {
                    audio.play();
                }
                else {
                    audio.pause();
                }
                e.preventDefault();
            }
            else if (e.keyCode === 27) {
                audio.pause();
                audio.currentTime = 0;
                e.preventDefault();
            }
            else if (e.keyCode === 37) {
            }
            else if (e.keyCode === 39) {
            }
        };
        player.renderPlaying = renderPlaying;
        overlay.addEventListener('mousemove', function (e) {
            var time;
            player.renderLight(e.layerX * player.ratio);
            if (e.buttons === 1 || (typeof e.buttons === 'undefined' && e.which === 1)) {
                time = (e.layerX * player.ratio / player.width) * player.audio.duration;
                if (!isNaN(time)) {
                    player.audio.currentTime = time;
                }
            }
        });
        overlay.addEventListener('mousedown', function (e) {
            var time;
            if (e.buttons === 1 || (typeof e.buttons === 'undefined' && e.which === 1)) {
                time = (e.layerX * player.ratio / player.width) * player.audio.duration;
                if (!isNaN(time)) {
                    player.audio.currentTime = time;
                }
            }
            overlay.focus();
            e.preventDefault();
        });
        overlay.addEventListener('mouseover', function () {
            player.mousedOver = true;
        });
        overlay.addEventListener('mouseleave', function () {
            player.mousedOver = false;
            player.clearLight();
            player.renderCursor(null);
        });
        overlay.addEventListener('dblclick', function (e) {
            if (audio.paused) {
                audio.play();
            }
            else {
                audio.pause();
            }
            overlay.focus();
            e.preventDefault();
        });
        overlay.addEventListener('keydown', keydown);
        player.keydown = keydown;
        audio.addEventListener('progress', function (e) {
        });
        audio.addEventListener('timeupdate', function (e) {
            player.renderCursor(player.width * (audio.currentTime / audio.duration) | 0);
        });
        audio.addEventListener('playing', function () {
            if (player.playButton) {
                player.playButton.classList.remove('audio-play');
                player.playButton.classList.add('audio-pause');
            }
        });
        audio.addEventListener('ended', function () {
            if (player.playButton) {
                player.playButton.classList.remove('audio-pause');
                player.playButton.classList.add('audio-play');
            }
        });
        audio.addEventListener('pause', function () {
            if (player.playButton) {
                player.playButton.classList.remove('audio-pause');
                player.playButton.classList.add('audio-play');
            }
        });
    };
    WavePlayer.prototype.renderWaveform = function () {
        var i, max = this.maxes, min = this.mins, l = min.length, height = this.height, scale = +this.scale, hh = (height * 0.5 | 0) + 0.5, innerScale = +scale * this.innerScale, sec5 = (this.width / this.buffer.duration), tickHeight = (height / 20 | 0) + 0.5 * this.ratio, tickHeight5 = tickHeight * 2, tickHeight60 = tickHeight5 * 2, s, ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);
        ctx.strokeStyle = this.strokeStyle;
        ctx.lineWidth = this.lineWidth;
        ctx.fillStyle = this.fillStyle;
        ctx.beginPath();
        ctx.moveTo(0, (max[0] * scale * height | 0) + hh);
        for (i = 1; i < l; i++) {
            ctx.lineTo(i, (max[i] * scale * height | 0) + hh);
        }
        while (i--) {
            ctx.lineTo(i, (min[i] * scale * height | 0) + hh);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.fillStyle = this.innerFillStyle;
        ctx.moveTo(0, (max[0] * innerScale * height | 0) + hh);
        for (i = 1; i < l; i++) {
            ctx.lineTo(i, (max[i] * innerScale * height | 0) + hh);
        }
        while (i--) {
            ctx.lineTo(i, (min[i] * innerScale * height | 0) + hh);
        }
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.strokeStyle = this.tickStyle;
        l = this.buffer.duration | 0;
        for (i = 0; i < l; i += 5) {
            ctx.moveTo((i * sec5 | 0) + 0.5, height);
            ctx.lineTo((i * sec5 | 0) + 0.5, height - (i % 60 === 0 ? tickHeight60 : i % 15 === 0 ? tickHeight5 : tickHeight));
            s++;
        }
        ctx.stroke();
        ctx.beginPath();
        ctx.strokeStyle = this.midLineStyle;
        ctx.lineWidth = this.midLineWidth;
        ctx.moveTo(0, hh);
        ctx.lineTo(this.width, hh);
        ctx.stroke();
    };
    WavePlayer.prototype.computeWaveform = function () {
        var i = 0 | 0, ch = this.channel, l = ch.length | 0, chunkSize = Math.ceil(l / (+this.width / +this.resolution)) | 0, chunkStart = 0 | 0, a = 0 | 0, downsampledSize = (+this.width / +this.resolution) | 0, min = new Float32Array(downsampledSize), max = new Float32Array(downsampledSize), abs = Math.abs, maxVal = 0;
        for (; i < l; i++) {
            a = (i | 0) / (chunkSize | 0) | 0;
            if (ch[i] < min[a]) {
                min[a] = ch[i];
            }
            if (ch[i] > max[a]) {
                max[a] = ch[i];
            }
        }
        this.mins = min;
        this.maxes = max;
        l = downsampledSize;
        for (i = 0; i < l; i++) {
            if (abs(min[i]) > maxVal) {
                maxVal = abs(min[i]);
            }
            if (abs(max[i]) > maxVal) {
                maxVal = abs(max[i]);
            }
        }
        this.scale = 1 / maxVal * 0.5;
    };
    WavePlayer.prototype.clearLight = function () {
        this.overCtx.clearRect(this.light - this.lightWidth, 0, this.lightWidth * 2, this.height);
        this.overCtx.clearRect(this.light - this.lightWidth, 0, this.lastTimeWidth + 12, this.timeHeight + 1);
    };
    WavePlayer.prototype.renderLight = function (pos, noCursor) {
        var oldLight = this.light, light, time = timeToText(((pos === null ? this.light : pos) / this.width) * this.audio.duration | 0), overCtx = this.overCtx, timeHeight = this.timeHeight, x = +0;
        this.clearLight();
        if (pos !== null) {
            this.light = pos;
        }
        light = this.light;
        x = this.lightWidth % 2 === 1 ? light - 0.5 : light;
        if (!noCursor) {
            overCtx.beginPath();
            overCtx.moveTo(x, 0);
            overCtx.lineTo(x, this.height);
            overCtx.strokeStyle = this.lightBackgroundColor;
            overCtx.lineWidth = this.lightBackgroundWidth;
            overCtx.stroke();
            overCtx.strokeStyle = this.lightColor;
            overCtx.lineWidth = this.lightWidth;
            overCtx.stroke();
            pos !== null && this.renderCursor(null);
        }
        overCtx.font = timeHeight + 'px sans-serif';
        this.lastTimeWidth = overCtx.measureText(time).width;
        overCtx.fillStyle = this.timeBackgroundColor;
        overCtx.fillRect(x, 0, this.lastTimeWidth + 6, timeHeight);
        overCtx.fillStyle = this.fontColor;
        overCtx.fillText(time, light + 3.5, timeHeight + 1);
    };
    WavePlayer.prototype.renderCursor = function (pos) {
        var overCtx = this.overCtx, x = +0;
        overCtx.clearRect(this.cursor - this.cursorWidth, 0, this.cursorWidth * 2, this.height);
        if (pos !== null) {
            if (this.mousedOver) {
                this.renderLight(null);
            }
            else {
                this.renderLight(pos, true);
            }
            this.cursor = pos;
        }
        x = this.cursorWidth % 2 === 1 ? this.cursor - 0.5 : this.cursor;
        overCtx.beginPath();
        overCtx.moveTo(x, 0);
        overCtx.lineTo(x, this.height);
        overCtx.strokeStyle = this.cursorBackgroundColor;
        overCtx.lineWidth = this.cursorBackgroundWidth;
        overCtx.stroke();
        overCtx.strokeStyle = this.cursorColor;
        overCtx.lineWidth = this.cursorWidth;
        overCtx.stroke();
    };
    WavePlayer.prototype.bindPlay = function (element) {
        var that = this;
        this.playButton = element;
        element.classList.add(this.audio && this.audio.paused ? 'audio-pause' : 'audio-play');
        element.addEventListener('click', function () {
            if (that.audio.paused) {
                that.audio.play();
            }
            else {
                that.audio.pause();
            }
        });
        element.addEventListener('keydown', this.keydown);
    };
    WavePlayer.prototype.bindStop = function (element) {
        var that = this;
        this.stopButton = element;
        element.addEventListener('click', function () {
            that.audio.pause();
            that.audio.currentTime = 0;
        });
    };
    WavePlayer.prototype.loadAudioData = function () {
        var xhr = new XMLHttpRequest(), that = this, ctx = that.overCtx, audioDone = false, xhrDone = false;
        xhr.open('GET', this.src);
        xhr.responseType = 'arraybuffer';
        xhr.addEventListener('load', function () {
            ctx.clearRect(0, 0, that.width, that.height);
            audioCtx.decodeAudioData(xhr.response, function (decodedBuffer) {
                that.buffer = decodedBuffer;
                that.audio = new BufferPlayer(that.buffer);
                closureFunctions(that);
                that.channel = that.buffer.getChannelData(0);
                that.computeWaveform();
                that.renderWaveform();
            });
        });
        xhr.addEventListener('progress', function (e) {
            var width = that.width * (e.loaded / e.total);
            if (!xhrDone) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
                ctx.clearRect(0, 0, width, that.height);
                ctx.fillRect(0, 0, width, that.height);
            }
        });
        xhr.send();
    };
    WavePlayer.prototype.initialize = function (parent) {
        var element, canvas, overlay, ratio = +0;
        if (this.element !== null && this.parent !== null) {
            this.parent.removeChild(this.element);
        }
        this.element = document.createElement('span');
        element = this.element;
        element.style.position = 'relative';
        element.style.display = 'inline-block';
        element.style.width = '100%';
        element.style.height = '100%';
        if (parent) {
            this.parent = parent;
            this.parent.appendChild(this.element);
        }
        this.ratio = +window.devicePixelRatio || +1;
        ratio = this.ratio;
        this.width = +this.element.offsetWidth * ratio;
        this.height = +this.element.offsetHeight * ratio;
        this.timeHeight *= ratio;
        this.midLineWidth *= ratio;
        this.lightWidth *= ratio;
        this.lightBackgroundWidth *= ratio;
        this.cursorWidth *= ratio;
        this.cursorBackgroundWidth *= ratio;
        this.canvas = document.createElement('canvas');
        canvas = this.canvas;
        this.ctx = this.canvas.getContext('2d');
        this.overlay = document.createElement('canvas');
        overlay = this.overlay;
        canvas.width = this.width;
        canvas.height = this.height;
        overlay.width = this.width;
        overlay.height = this.height;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.position = 'absolute';
        overlay.style.left = '0px';
        overlay.style.top = '0px';
        overlay.setAttribute('tabindex', 0);
        this.overCtx = this.overlay.getContext('2d');
        this.overCtx.textBaseline = 'bottom';
        this.ctx.fillStyle = 'black';
        this.ctx.font = (this.height / 2 | 0) + 'px sans-serif';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(this.loadingText, 50, this.height / 2);
        this.loadAudioData();
        element.appendChild(canvas);
        element.appendChild(overlay);
    };
    window.WavePlayer = WavePlayer;
}());
//# sourceMappingURL=waveplayer.js.map