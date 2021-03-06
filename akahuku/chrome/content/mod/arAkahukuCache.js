/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */

/**
 * Require: Akahuku, arAkahukuConfig,
 *          arAkahukuReload, arAkahukuFile, arAkahukuCompat
 */

/**
 * キャッシュ制御モジュール
 */
Akahuku.Cache = new function () {
  "use strict";

  /**
   * 初期化処理
   */
  this.init = function () {
    /* window.addEventListener ("TabMove", function () { }, true); */
  };

  /**
   * ドキュメントのスタイルを設定する
   *
   * @param  arAkahukuStyleData style
   *         スタイル
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   * @param  arAkahukuLocationInfo info
   *         アドレス情報
   */
  this.setStyle = function (style, targetDocument, info) {
    /*if (info.isNormal || info.isReply) {
      style
      .addRule ("span.akahuku_bottom_status_number",
                "font-size: 10pt; "
                + "vertical-align: text-bottom;")
      .addRule ("span.akahuku_bottom_status_alert",
                "font-size: 9pt; "
                + "color: #f00000; "
                + "background-color: inherit;");
    }*/
  };
    
  /**
   * スタイルファイルのスタイルを設定する
   *
   * @param  arAkahukuStyleData style
   *         スタイル
   */
  this.setStyleFile = function (style) {
  };
    
  /**
   * スタイルファイルのスタイルを解除する
   *
   * @param  arAkahukuStyleData style
   *         スタイル
   */
  this.resetStyleFile = function (style) {
  };
    
  /**
   * 設定を読み込む
   */
  this.getConfig = function () {
    //= arAkahukuConfig.initPref ("bool", "akahuku.cache", false);
  };

  /**
   * body の unload イベント
   * (Akahuku.onBodyUnload から呼ばれる)
   *
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   * @param  arAkahukuDocumentParam documentParam
   *         ドキュメントごとの情報
   */
  this.onBodyUnload = function (targetDocument, documentParam) {
    try {
      if (documentParam.cachedimages)
        documentParam.cachedimages.destruct ();
    }
    catch (e) { Akahuku.debug.exception (e);
    }
    delete documentParam.cachedimages;
  };

  /**
   * DOMContentLoaded 後の処理
   * (Akahuku.apply から呼ばれる)
   *
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   * @param  arAkahukuLocationInfo info
   *         アドレス情報
   */
  this.apply = function (targetDocument, info) {
    if (info.isReply) {
      var documentParam = Akahuku.getDocumentParam (targetDocument);
      documentParam.cachedimages = new CachedImageReserver ();
    }

    if (info.isCache) {
      Akahuku.Cache.asyncGetStatus
        (targetDocument.location.href,
         function (cacheStatus) {
          notifyCacheStatus (targetDocument, cacheStatus);
         });
    }
  };

  // キャッシュを表示中 とユーザーに通知
  function notifyCacheStatus (targetDocument, cacheStat) {
    if (!cacheStat.isExist || cacheStat.httpStatusCode === "404") {
      return;
    }
    var lmday = new Date (cacheStat.lastModified);
    var timestamp
      = "\u66F4\u65B0\u65E5\u6642:" //"更新日時"
      + lmday.toLocaleString ();
    try {
      var box = getNotificationBox (targetDocument.defaultView);
      var oldItem = box.getNotificationWithValue (Akahuku.Cache);
      box.appendNotification
        ("\u30AD\u30E3\u30C3\u30B7\u30E5\u3092\u8868\u793A\u4E2D"
         //"キャッシュを表示中 ("
         + ": " + cacheStat.key
         + " (" + timestamp + ")",
         Akahuku.Cache,
         "chrome://akahuku/content/images/icon_small.png",
         box.PRIORITY_WARNING_LOW,
         []);
      if (oldItem) {
        box.removeNotification (oldItem);
      }
    }
    catch (e) { Akahuku.debug.exception (e);
    }
  };


  /**
   * キャッシュの状態を調べる (非同期)
   * @param  String url
   *         対象のURL
   * @param  Function callback
   *         状態(Object)を受け取るコールバック関数
   */
  this.asyncGetStatus = function (url, callback) {
    var p = Akahuku.protocolHandler.getAkahukuURIParam (url);
    if (p.type === "filecache") {
      var status = _getFilecacheStatus (p.original);
      callback.apply (null, [status]);
    }
    else if (p.type === "cache") {
      var callbackHttpCacheStatus
        = function (status) {
          if ((!status.isExist || status.httpStatusCode === "404")
              && /\d+\.htm$/.test (url)) {
            url = p.original + ".backup";
            Akahuku.Cache.asyncGetHttpCacheStatus
              (url, false, callbackHttpCacheStatus);
            return;
          }
          callback.apply (null, [status]);
        };
      Akahuku.Cache.asyncGetHttpCacheStatus
        (p.original, false, callbackHttpCacheStatus);
    }
    Akahuku.Cache.asyncGetHttpCacheStatus (url, false, callback);
  };
  this.asyncGetHttpCacheStatus = function (key, noRedirect, callback) {
    var status = new CacheStatus (key);
    var finder = new Akahuku.Cache.RedirectedCacheFinder ();
    finder.init ();
    if (noRedirect) {
      finder.maxRedirections = 0;
    }
    var callbackStatus = callback;
    if (!callbackStatus) {
      Akahuku.debug.warning ("aborted by invalid callback");
      return;
    }
    try {
      finder.asyncOpen (key, function (descriptor) {
        if (!descriptor) {
          callbackStatus.apply (null, [status]);
          return;
        }

        status.isExist = true;
        status.key = descriptor.key;
        status.expires = descriptor.expirationTime;
        status.dataSize = descriptor.dataSize;
        status.lastModified = descriptor.lastModified * 1000; //[ms]

        // HTTP status
        var text = descriptor.getMetaDataElement ("response-head");
        if (text) {
          var headers = text.match (/[^\r\n]*\r\n/g);
          if (headers.length > 0) {
            status.header = {};
            var re = headers [0].match
              (/^HTTP\/[0-9]\.[0-9] ([0-9]+) ([^\r\n]+)/);
            if (re) {
              status.httpStatusCode = re [1];
              status.httpStatusText = re [2];
            }
          }
          for (var i = 1; i < headers.length; i ++) {
            var matches = headers [i].match (/^([^:\s]+):\s*([^\s].*)\r\n/);
            if (!matches) continue;
            status.header [matches [1]] = matches [2];
          }
        }

        descriptor.close ();
        callbackStatus.apply (null, [status]);
      });
    }
    catch (e) { Akahuku.debug.exception (e);
      callbackStatus.apply (null, [status]);
    }
  };

  function CacheStatus (key) {
    this.isExist = false;
    this.key = key;
  }
  CacheStatus.prototype = {
    expires : 0,
    dataSize : 0,
    lastModified : 0,
    httpStatusCode : "000",
    httpStatusText : "No HTTP response",
    header : {},
  };
  function _getFilecacheStatus (originalUrl) {
    var status = new CacheStatus (originalUrl);
    if (!(/^https?:/.test (originalUrl))) {
      return status;
    }
    // from arAkahukuReloadCacheWriter.createFile ()
    var path = originalUrl.replace (/^https?:\/\//, "");
    var base
      = arAkahukuFile.getURLSpecFromDirname
      (arAkahukuReload.extCacheFileBase);
    path = arAkahukuFile.getFilenameFromURLSpec (base + path);

    var targetFile
      = Components.classes ["@mozilla.org/file/local;1"]
      .createInstance (Components.interfaces.nsILocalFile);
    targetFile.initWithPath (path);
    if (targetFile.exists ()) {
      status.isExist = true;
      status.key = path;
      status.lastModified = targetFile.lastModifiedTime;
    }
    return status;
  }



  /**
   * 画像のロード状態診断結果
   */
  function ImageStatus () {
    this.isImage = false;
    this.isBlocked = false;
    this.isErrored = false;
  };
  ImageStatus.prototype = {
    blockingStatus : 0,
    requestImageStatus : 0,
    requestURI : null, 
    cache : new CacheStatus (),
  };

  /**
   * 画像のロード状態を調べる
   *
   * @param  HTMLImageElement img
   *         対象の画像要素
   * @return Object
   *         画像の状態
   */
  this.getImageStatus = function (img) {
    var status = new ImageStatus ();
    try {
      img
        = img.QueryInterface
          (Components.interfaces.nsIImageLoadingContent);
      status.isImage = true;

      /* コンテンツポリシーによるブロックチェック */
      status.isBlocked = 
        (img.imageBlockingStatus
         != Components.interfaces.nsIContentPolicy.ACCEPT);
      status.blockingStatus = img.imageBlockingStatus;

      /* リクエストチェック */
      var request
        = img.getRequest
          (Components.interfaces.nsIImageLoadingContent
           .CURRENT_REQUEST);
      if (request) {
        status.requestImageStatus = request.imageStatus;
        status.requestURI = request.URI;
        var errorMask
          = Components.interfaces.imgIRequest.STATUS_LOAD_PARTIAL
            | Components.interfaces.imgIRequest.STATUS_ERROR;
        status.isErrored = ((request.imageStatus & errorMask) != 0);
      }
    }
    catch (e if e.result == Components.results.NS_ERROR_NO_INTERFACE) {
      status.isImage = false;
    }
    catch (e) { Akahuku.debug.exception (e);
    }

    return status;
  };

    

  /**
   * 画像要素をキャッシュのアドレスに変換する
   *
   * @param  HTMLElement context
   *         呼び出し元
   * @param  String contentLocation
   *         対象の URI
   */
  this.enCacheURIContext = function (context, contentLocation) {

    // taken from arAkahukuP2P.enP2P
    /* ScrapBook には干渉しない */
    if ("id" in context && context.id == "sbCaptureBrowser") {
      return;
    }

    if (!contentLocation) {
      var status = Akahuku.Cache.getImageStatus (context, true);
      if (status.cache.isExist && status.cache.key) {
        contentLocation = status.cache.key;
      }
    }
    if (!contentLocation || !/^https?:/.test (contentLocation)) {
      return;
    }

    var src
      = Akahuku.protocolHandler
      .enAkahukuURI ("cache", contentLocation);

    // Akahuku.Cache によって制御されているページでは
    // ロード成功したキャッシュは保持リストに送る
    var param = Akahuku.getDocumentParam (context.ownerDocument);
    if (param && "cachedimages" in param) {
      context.addEventListener
        ("load",
         param.cachedimages.onLoadListenerFactory
         (src, contentLocation),
         false);
    }

    context.src = src;
  };
    
  this.enCacheURIForImages = function (rootElement) {
    var nodes = rootElement.getElementsByTagName ("img");
    for (var i = 0; i < nodes.length; i ++) {
      Akahuku.Cache.enCacheURIContext (nodes [i]);
    }
  };

  /**
   * リダイレクトを解決しながらキャッシュエントリを探す
   *   (エラー時は null をコールバックに通知)
   */
  this.RedirectedCacheFinder = function () {
    this.openFlag = arAkahukuCompat.CacheStorage.OPEN_READONLY;
    this._storage = null;
    this._isPending = false;
    this._lastEntry = null;
    this._callback = null;
    this._redirected = 0;
  };
  this.RedirectedCacheFinder.prototype = {
    maxRedirections : 10,
    init : function ()
    {
      var Ci = Components.interfaces;
      var loadContextInfo = null;
      try {
        if ("fromLoadContext" in arAkahukuCompat.LoadContextInfo) {
          loadContextInfo =
            arAkahukuCompat.LoadContextInfo.fromLoadContext
            (window.QueryInterface (Ci.nsIInterfaceRequestor)
             .getInterface (Ci.nsIWebNavigation)
             .QueryInterface (Ci.nsILoadContext),
             false);
        }
      }
      catch (e) { Akahuku.debug.exception (e);
      }
      this._storage
        = arAkahukuCompat.CacheStorageService
        .diskCacheStorage (loadContextInfo, false);
    },
    isPending : function () { return this._isPending },
    cancel : function ()
    {
      this._isPending = false;
      if (this._lastEntry)
        this._lastEntry.close ();
    },
    asyncOpen : function (key, callback)
    {
      this._redirected = 0;
      if (this._isPending)
        throw Components.results.NS_ERROR_IN_PROGRESS;
      var ios = Components.classes ["@mozilla.org/network/io-service;1"]
        .getService (Components.interfaces.nsIIOService);
      var uri = ios.newURI (key, null, null);
      this._callback = callback;
      this._lastEntry = null;
      this._isPending = true;
      this._storage.asyncOpenURI (uri, "", this.openFlag, this);
    },
    // nsICacheEntryOpenCallback
    mainThreadOnly : true,
    onCacheEntryCheck : function (entry, appCache) {
      return arAkahukuCompat.CacheEntryOpenCallback.ENTRY_WANTED;
    },
    onCacheEntryAvailable : function (entry, isNew, appCache, result)
    {
      if (!this._isPending) { // canceled
        if (entry)
          entry.close ();
        if (this._lastEntry)
          this._lastEntry.close ();
        this._lastEntry = null;
        this._callback = null;
        return;
      }
      if (Components.isSuccessCode (result)) {
        if (this._lastEntry)
          this._lastEntry.close ();
        this._lastEntry = entry;
        var dest = this._resolveRedirection (entry);
        if (dest) {
          var ios = Components.classes ["@mozilla.org/network/io-service;1"]
            .getService (Components.interfaces.nsIIOService);
          var uri = ios.newURI (dest, null, null);
          this._storage.asyncOpenURI (uri, "", this.openFlag, this);
          return; // dest の onCacheEntryAvailable を待つ
        }
      }

      if (this._callback) {
        try {
          this._callback.apply (this, [this._lastEntry]);
        }
        catch (e) { Akahuku.debug.exception (e);
        }
        this._callback = null;
      }
      this._lastEntry = null;
      this._isPending = false;
    },

    _resolveRedirection : function (descriptor)
    {
      var head = descriptor.getMetaDataElement ("response-head");
      var httpStatusCode = "000";
      if (head && head.match (/^HTTP\/\d\.\d (\d{3}) ([^\r\n]+)/)) {
        httpStatusCode = RegExp.$1;
      }
      if (httpStatusCode [0] == "3" // ie. 301 Moved Permanently
          && head.match (/^Location: ([^\s]+)/m)) {
        var dest = RegExp.$1;
        if (this._redirected < this.maxRedirections) {
          this._redirected ++;
          return dest;
        }
      }
      return null;
    },
  };

  /**
   * ページ内のキャッシュ済み画像を管理
   *   登録中はキャッシュの有効期限を最大に延ばす
   */
  function CachedImageReserver () {
    this.keys = [];
    this.originalExpireTimes = {};
  };
  CachedImageReserver.prototype = {
    /**
     * データを開放する
     */
    destruct : function () {
      var CacheEtimeRestorer = function (t) {
        this.originalExpirationTime = t;
      };
      CacheEtimeRestorer.prototype = {
        onCacheEntryAvailable : function (entry, isNew, appCache, status)
        {
          if (Components.isSuccessCode (status)) {
            if (entry.expirationTime == 0xFFFFFFFF) {
              entry.setExpirationTime (this.originalExpirationTime);
            }
          }
        },
        mainThreadOnly : true,
        onCacheEntryCheck : function (entry, appCache) {
          return arAkahukuCompat.CacheEntryOpenCallback.ENTRY_WANTED;
        },
      };

      var loadContextInfo = null;
      try {
        loadContextInfo = arAkahukuCompat.LoadContextInfo.default;
      }
      catch (e) {
      }
      var storage = arAkahukuCompat.CacheStorageService
        .diskCacheStorage (loadContextInfo, false);

      var flag = arAkahukuCompat.CacheStorage.OPEN_READONLY;
      var ios = Components.classes ["@mozilla.org/network/io-service;1"]
        .getService (Components.interfaces.nsIIOService);

      for (var i=0; i < this.keys.length; i++) {
        var t = this.originalExpireTimes [this.keys [i]];
        var listener = new CacheEtimeRestorer (t);
        try {
          var uri = ios.newURI (this.keys [i], null, null);
          storage.asyncOpenURI (uri, "", flag, listener);
        }
        catch (e) { Akahuku.debug.exception (e);
        }
      }

      this.keys = null;
      this.originalExpireTimes = null;
    },
    
    onLoadListenerFactory : function (src, originalSrc)
    {
      var that = this;
      return function (event) {
        if (event.target.src != src) return;
        var finder = new Akahuku.Cache.RedirectedCacheFinder ();
        finder.init ();
        finder.asyncOpen
          (originalSrc,
           function (descriptor) {
              if (descriptor) {
                that.register (descriptor);
                descriptor.close ();
              }
            });
      };
    },
    register : function (descriptor)
    {
      if (!this.originalExpireTimes.hasOwnProperty (descriptor.key)
          && descriptor.expirationTime != 0xFFFFFFFF) {
        this.keys.push (descriptor.key);
        this.originalExpireTimes [descriptor.key]
          = descriptor.expirationTime;
        // キャッシュを保持させる
        descriptor.setExpirationTime (0xFFFFFFFF);
      }
    },
  };

  /**
   * キャッシュを開く
   */
  this.asyncOpenCache = function (url, flag, callback) {
    var Ci = Components.interfaces;
    var loadContextInfo = null;
    if ("fromLoadContext" in arAkahukuCompat.LoadContextInfo) {
      try {
        loadContextInfo =
          arAkahukuCompat.LoadContextInfo.fromLoadContext
          (window.QueryInterface (Ci.nsIInterfaceRequestor)
           .getInterface (Ci.nsIWebNavigation)
           .QueryInterface (Ci.nsILoadContext), false);
      }
      catch (e) { Akahuku.debug.exception (e);
      }
    }
    try {
      var cacheStorage
        = arAkahukuCompat.CacheStorageService
        .diskCacheStorage (loadContextInfo, false);
      var ios = Components.classes
        ["@mozilla.org/network/io-service;1"]
        .getService (Ci.nsIIOService);
      var uri = ios.newURI (url, null, null);
      cacheStorage.asyncOpenURI (uri, "", flag, callback);
    }
    catch (e) { Akahuku.debug.exception (e);
    }
  };
  this.asyncOpenCacheToWrite = function (url, callback) {
    var flag = arAkahukuCompat.CacheStorage.OPEN_TRUNCATE;
    this.asyncOpenCache (url, flag, callback);
  };
  this.asyncOpenCacheToRead = function (url, callback) {
    var flag = arAkahukuCompat.CacheStorage.OPEN_READONLY;
    this.asyncOpenCache (url, flag, callback);
  };

};

