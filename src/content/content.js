(function (_window) {
    var Content = Base.extend({

        MUSIC_163_PLAYER_ID: Config.music_163_player_id,
        MUSIC_163_LIST_ID: Config.music_163_player_list_id,
        UNIQUE_ID: '',
        CHECK_MUSIC_CHANGE_DELAY: 500,
        CHECK_INIT_DELAY: 1000,


        playerInit: false,
        bitRate: 0,
        isPlaying: '',
        clickEL: null,
        contentFrameDocument: null,
        addLikeInnerInterval: null,
        addLikeOuterInterval: null,
        currentSongID: '',
        connectPort: '',
        playType: {
            "随机":"shuffle",
            "单曲循环":"loop-one",
            "循环":"loop"
        },

        events: {
            'click .ply': 'changePlayState'
        },

        listIconEL: $('.icn.icn-list'),
        volumeIconEl: $('.icn.icn-vol'),
        volumeBarEl: $('.vbg.j-t'),
        volumeEL: $('.m-vol'),
        progressEL: $('.barbg.j-flag'),
        likeEl: $('.icn-add.j-flag'),
        contentFrame: $('#g_iframe'),

        afterInit: function () {
            var self = this;
            self.addBitRateDataElement();
            self.injectSongImprove();
            self.getPageUniqueID();
            self.checkPlayerInit(function () {
                self.playerInit = true;
                self.connectWithExtension();
                self.sendInitMessage();
                self.listenMusicChange();
            });
            self.addGoPageElement();
            self.bindOtherEvents();
            // self.injectStyle();
            self.contentFrameDocument = self.contentFrame.contentDocument || self.contentFrame.contentWindow.document;
        },
        addBitRateDataElement: function () {
            var el = document.createElement('a');
            el.id = 'bit-rate';
            el.href = 'javascript:;';
            document.body.appendChild(el);
        },
        injectSongImprove: function(){
            Util.injectScript(chrome.extension.getURL('js/improve.js'),'body');
        },
        listenMusicChange: function () {
            var self = this;
            var songID = '';
            setInterval(function () {
                self.refreshPlayState();
                self.sendSongProgressMessage();
                self.checkBitRateChange();
                songID = self.getSongID();
                if(songID != self.currentSongID){
                    self.currentSongID = songID;
                    self.sendSongChangeMessage();
                }
            }, self.CHECK_MUSIC_CHANGE_DELAY);
        },
        checkBitRateChange: function () {
            var self = this;
            var bitRateEl = document.querySelector('#bit-rate');
            chrome.storage.sync.get({
                bitRate: 96
            }, function(items) {
                if(items.bitRate != self.bitRate){
                    self.bitRate = items.bitRate;
                    bitRateEl.setAttribute('data-bit',self.bitRate);
                    bitRateEl.click();
                }
            });
        },
        sendSongProgressMessage: function (force) {
            var self = this;
            if(!self.isPlaying&&!force) return;
            self.sendMessage({
                type: Events.SONG_PROGRESS,
                songInfo: self.getSongInfo(),
                isLogin: self.getUserIsLogin()
            });
        },
        addGoPageElement: function () {
            this.clickEL = document.createElement('a');
            this.clickEL.id = 'on-player-go-page';
            document.body.appendChild(this.clickEL);
        },
        refreshPlayState: function () {
            var state = $(this.MUSIC_163_PLAYER_ID + ' .ply').getAttribute('data-action') == 'pause';
            if (this.isPlaying != state && state == false){
                this.sendMessage({type: Events.SONG_PAUSE});
            }
            this.isPlaying = state;
        },
        changePlayState: function (e) {
            if(e.currentTarget.getAttribute('data-action') == 'pause'){
                this.isPlaying = false;
                this.sendMessage({type: Events.SONG_PAUSE})
            }
        },
        checkPlayerInit: function (callback) {
            var self = this;
            var songName = self.getSongName();
            var interval = setInterval(function () {
                if(songName!=''){
                    clearInterval(interval);
                    callback && callback();
                }else{
                    songName = self.getSongName();
                }
            }, self.CHECK_INIT_DELAY)
        },
        getUserIsLogin: function () {
            return $('#g-topbar .m-tophead .head') !== null;
        },
        injectStyle: function () {
            var css = '#g_playlist { display: none; }',
                head = document.head || document.getElementsByTagName('head')[0],
                style = document.createElement('style');

            style.type = 'text/css';
            if (style.styleSheet){
                style.styleSheet.cssText = css;
            } else {
                style.appendChild(document.createTextNode(css));
            }

            head.appendChild(style);
        },
        bindOtherEvents: function () {
            var self = this;
            $$(this.MUSIC_163_PLAYER_ID + ' .ctrl a')[1].addEventListener('click',function () {
                self.sendPlayTypeChangeMessage.call(self);
            })
        },
        connectWithExtension: function () {
            var self = this;
            self.connectPort = chrome.runtime.connect({name: self.UNIQUE_ID});
            self.listenExtensionMessage();
        },
        listenExtensionMessage: function () {
            var self = this;
            self.connectPort.onMessage.addListener(function (message) {
                switch (message.type){
                    case Events.NEXT:
                        self.playNext();
                        break;
                    case Events.PREV:
                        self.playPrev();
                        break;
                    case Events.STATE_CHANGE:
                        self.playOrPause();
                        break;
                    case Events.VOLUME_CHANGE:
                        self.changeVolume(message.percent);
                        break;
                    case Events.TIME_CHANGE:
                        self.changeTime(message.percent);
                        break;
                    case Events.PLAY_TYPE_CHANGE:
                        self.changePlayType();
                        break;
                    case Events.GO_PAGE:
                        self.goPage(message.page);
                        break;
                    case Events.CLICK_SONG_LIST_ITEM:
                        self.selectSongInSongList(message.id);
                        break;
                    case Events.REQUEST_SONG_LIST:
                        self.sendSongList();
                        break;
                    case Events.REQUEST_SONG_LRC:
                        self.sendSongLrc();
                        break;
                    case Events.ADD_TO_LIKE:
                        self.addToLike();
                        break;
                    case Events.GET_SONG_TIME:
                        self.sendSongTime();
                }
            })
        },
        sendPlayTypeChangeMessage: function () {
            var self = this;
            setTimeout(function () {
                self.sendMessage({
                    type: Events.PLAY_TYPE_CHANGE,
                    playType: self.getPlayType()
                });
            },0);
        },
        sendSongList: function () {
            var self = this;
            this.getSongList(function (songList) {
                self.sendMessage({
                    type: Events.RESPONSE_SONG_LIST,
                    songList: songList.innerHTML
                })
            });
        },
        sendSongLrc: function () {
            var self = this;
            this.getSongLrc(function (lrc) {
                Util.observeDOM(document.querySelector('.listlyric.j-flag'), function () {
                    self.sendMessage({
                        type: Events.RESPONSE_SONG_LRC,
                        songLrc: lrc.innerHTML
                    })
                });
                self.sendMessage({
                    type: Events.RESPONSE_SONG_LRC,
                    songLrc: lrc.innerHTML
                });
            });
        },
        sendSongTime: function () {
            this.sendMessage({
                type: Events.RESPONSE_SONG_TIME,
                time: this.getSongTime()
            });
        },
        addToLike: function () {
            var self = this;
            var likeItem = null;
            var msg = '';
            var msgEl = null;
            var frame = null;
            var contentFrameDocument = null;
            self.likeEl.click();
            frame = $('#g_iframe');
            contentFrameDocument = frame.contentDocument || frame.contentWindow.document;
            clearInterval(self.addLikeOuterInterval);
            clearInterval(self.addLikeInnerInterval);
            self.addLikeOuterInterval = setInterval(function () {
                likeItem = contentFrameDocument.querySelector('.xtag');
                if(likeItem){
                    likeItem.click();
                    clearInterval(self.addLikeOuterInterval);
                    self.addLikeInnerInterval = setInterval(function () {
                        msgEl = contentFrameDocument.querySelector('.m-sysmsg');
                        msg = msgEl && msgEl.innerText;
                        if(msg){
                            clearInterval(self.addLikeInnerInterval);
                            self.sendAddLikeMessage(msg);
                        }
                    },100);
                }
            },500);
        },
        sendAddLikeMessage: function (msg) {
            this.sendMessage({
                type: Events.ADD_LIKE_FINISH,
                msg: msg
            });
        },
        sendSongChangeMessage: function () {
            var self = this;
            self.sendMessage({
                type: Events.SONG_CHANGE,
                songInfo: self.getSongInfo(),
                isLogin: self.getUserIsLogin()
            });
        },
        sendInitMessage: function () {
            var self = this;
            self.sendMessage({
                "type": Events.INIT_PLAYER,
                "songInfo": self.getSongInfo(),
                "isLogin": self.getUserIsLogin()
            })
        },
        sendMessage: function (message) {
            this.connectPort.postMessage(message);
        },
        getSongList: function (callback) {
            callback = callback || Util.noop;
            this.showSongList(function (songList) {
                callback(songList.querySelector('.listbdc.j-flag'));
            });
        },
        getSongLrc: function (callback) {
            callback = callback || Util.noop;
            clearInterval(self.getLrcInterval);
            this.showSongList(function (songList) {
                callback(songList.querySelector('.listlyric.j-flag'));
            });
        },
        hideSongList: function () {
            var songListEl = $(this.MUSIC_163_LIST_ID);
            if(songListEl){
                this.listIconEL.click();
            }
        },
        showSongList: function (callback) {
            var songListEl = $(this.MUSIC_163_LIST_ID);
            var interval = null;
            var self = this;
            callback = callback || Util.noop;
            if(!songListEl){
                self.listIconEL.click();
                interval = setInterval(function () {
                    songListEl = $(self.MUSIC_163_LIST_ID);
                    if(songListEl){
                        callback(songListEl);
                        clearInterval(interval);
                    }
                },100);
            }else{
                callback(songListEl);
            }
        },
        getSongInfo: function () {
            var self = this;
            var singerInfo = self.getSingerInfo();
            return {
                "song_id": self.getSongID(),
                "song_img": self.getSongImage(),
                "song_name": self.getSongName(),
                "singer_id": singerInfo.id,
                "singer_name": singerInfo.name,
                "loaded": self.getSongLoaded(),
                "played": self.getSongPlayed(),
                "playing": self.isPlaying,
                "play_type": self.getPlayType(),
                "volume": self.getVolumePercent()
            }
        },
        getSingerInfo: function () {
            var singerEl = $(this.MUSIC_163_PLAYER_ID + ' .by a');
            if(singerEl){
                return {
                    id: singerEl.getAttribute('href').match(/\d+/)[0],
                    name: singerEl.innerHTML
                };   
            }else {
                singerEl = $(this.MUSIC_163_PLAYER_ID + ' .by span');
                return {
                    id: 0,
                    name: singerEl.innerHTML
                };
            }
        },
        getVolumePercent: function () {
            return this.volumeBarEl.querySelector('.curr').clientHeight / this.volumeBarEl.clientHeight * 100 + '%';
        },
        getPlayType: function () {
            var playTypeEL = $$(this.MUSIC_163_PLAYER_ID + ' .ctrl a')[1];
            return this.playType[playTypeEL.title];
        },
        getSongPlayed: function () {
            return $(this.MUSIC_163_PLAYER_ID + ' .cur').style.width;
        },
        getSongLoaded: function () {
            return $(this.MUSIC_163_PLAYER_ID + ' .rdy').style.width;
        },
        getSongImage: function () {
            return $(this.MUSIC_163_PLAYER_ID + ' .head img').src.replace(/34y34/gi,'180y180');
        },
        getSongTime: function () {
            return $(this.MUSIC_163_PLAYER_ID + ' .time').innerHTML.replace(/<\/*em>/gi,'');
        },
        getSongID: function () {
            return $(this.MUSIC_163_PLAYER_ID + ' .name').getAttribute('href').match(/\d+/)[0];
        },
        getSongName: function(){
            return $(this.MUSIC_163_PLAYER_ID + ' .name').innerHTML;
        },
        getPageUniqueID: function () {
            this.UNIQUE_ID = Util.generateUUID();
        },
        playPrev: function(){
            $(this.MUSIC_163_PLAYER_ID + ' .prv').click();
        },
        playNext: function(){
            $(this.MUSIC_163_PLAYER_ID + ' .nxt').click();
        },
        playOrPause: function(){
            $(this.MUSIC_163_PLAYER_ID + ' .ply').click();
        },
        changePlayType: function () {
            $$(this.MUSIC_163_PLAYER_ID + ' .ctrl a')[1].click();
        },
        goPage: function (page) {
            this.clickEL.href = page;
            this.clickEL.click();
        },
        changeVolume: function (percent) {
            var self = this;
            this.showVolume();
            var volumeBarHeight = this.volumeBarEl.clientHeight;
            var volume = this.volumeBarEl.clientHeight * percent;
            var rect = this.volumeBarEl.getBoundingClientRect();
            var evt = document.createEvent("MouseEvents");
            evt.initMouseEvent("mousedown", true, true, _window, 0, 0, 0, rect.left, rect.top + volumeBarHeight - volume, false, false, false, false, 0, null);
            this.volumeBarEl.dispatchEvent(evt);
            evt = document.createEvent("MouseEvents");
            evt.initMouseEvent("mouseup", true, true, _window, 0, 0, 0, rect.left, rect.top + volumeBarHeight - volume, false, false, false, false, 0, null);
            this.volumeBarEl.dispatchEvent(evt);

        },
        changeTime: function(percent){
            var progress = this.progressEL.clientWidth * percent;
            var rect = this.progressEL.getBoundingClientRect();
            var evt = document.createEvent("MouseEvents");
            evt.initMouseEvent("mousedown", true, true, _window, 0, 0, 0, rect.left + progress, rect.top, false, false, false, false, 0, null);
            this.progressEL.dispatchEvent(evt);
            this.sendSongProgressMessage(true);
        },
        showVolume: function () {
            if(!this.checkVolumeShow()){
                this.volumeIconEl.click();
            }
        },
        checkVolumeShow: function () {
            return this.volumeEL.style.visibility == 'visible';
        },
        selectSongInSongList: function(id){
            var self = this;
            self.getSongList(function (songList) {
                songList.querySelector('li[data-id="'+ id +'"]').click();
            });
        }
    });

    Content.init();
})(window);
