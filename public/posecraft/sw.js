/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-7e5eb42b'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "registerSW.js",
    "revision": "ba9cb7b6587adac33dd99936ebb7c19a"
  }, {
    "url": "pwa-512x512.png",
    "revision": "2a6fee07978bcf0eb14c3b492fb499e1"
  }, {
    "url": "pwa-192x192.png",
    "revision": "890361e2ae28d70a02a40f89d0b85f68"
  }, {
    "url": "logo.svg",
    "revision": "12987898141796f1dc418bad77dda6f1"
  }, {
    "url": "index.html",
    "revision": "47a665e1cfdf6721c525fe46cadce022"
  }, {
    "url": "favicon.svg",
    "revision": "cf5b034a7164d16730eb95453cc181da"
  }, {
    "url": "assets/wrench-D7aeYhjr.js",
    "revision": null
  }, {
    "url": "assets/WorkDetail-CNmJcLQh.css",
    "revision": null
  }, {
    "url": "assets/WorkDetail-BG6k7RNr.js",
    "revision": null
  }, {
    "url": "assets/work-CvhxJBp1.js",
    "revision": null
  }, {
    "url": "assets/users-Cd4KSUm_.js",
    "revision": null
  }, {
    "url": "assets/user-DjRg_Td-.js",
    "revision": null
  }, {
    "url": "assets/user-C1nU3O1R.js",
    "revision": null
  }, {
    "url": "assets/useLocation-BQsa-7X2.js",
    "revision": null
  }, {
    "url": "assets/useHome-CkrUOVr-.js",
    "revision": null
  }, {
    "url": "assets/triangle-alert-BMAF-5u8.js",
    "revision": null
  }, {
    "url": "assets/template-II40GdTu.js",
    "revision": null
  }, {
    "url": "assets/sparkles-DX0tuvL4.js",
    "revision": null
  }, {
    "url": "assets/SliderCaptcha-DlU42mPG.css",
    "revision": null
  }, {
    "url": "assets/SliderCaptcha-Cv9tQ0Pv.js",
    "revision": null
  }, {
    "url": "assets/SkeletonCard-Cwz2OtrM.js",
    "revision": null
  }, {
    "url": "assets/SkeletonCard-5JE9SDGV.css",
    "revision": null
  }, {
    "url": "assets/SettingsModal-Jp8tHdAb.js",
    "revision": null
  }, {
    "url": "assets/SettingsModal-BemxSxtz.css",
    "revision": null
  }, {
    "url": "assets/ServiceAgreement-DCpftgg4.js",
    "revision": null
  }, {
    "url": "assets/search-jhz3aKmA.js",
    "revision": null
  }, {
    "url": "assets/RecommendView-D4_M6QOq.css",
    "revision": null
  }, {
    "url": "assets/RecommendView-CCGj7KxE.js",
    "revision": null
  }, {
    "url": "assets/recommendation-DqrmObg4.js",
    "revision": null
  }, {
    "url": "assets/profile-DKNZe-1Q.js",
    "revision": null
  }, {
    "url": "assets/PrivacyPolicy-BfQxWy0E.js",
    "revision": null
  }, {
    "url": "assets/NearbyView-_wSICuxd.js",
    "revision": null
  }, {
    "url": "assets/NearbyView-DSvdQ_0X.css",
    "revision": null
  }, {
    "url": "assets/MineView-EnyflxF6.js",
    "revision": null
  }, {
    "url": "assets/MineView-BnFEkc6u.css",
    "revision": null
  }, {
    "url": "assets/message-circle-CvarbLxC.js",
    "revision": null
  }, {
    "url": "assets/map-pin-BMj2Icxp.js",
    "revision": null
  }, {
    "url": "assets/LoginView-De0DYeQC.js",
    "revision": null
  }, {
    "url": "assets/lock-D61k363m.js",
    "revision": null
  }, {
    "url": "assets/loader-circle-HVWL7XZv.js",
    "revision": null
  }, {
    "url": "assets/interaction-BYGJrzbr.js",
    "revision": null
  }, {
    "url": "assets/index-sIeh179_.js",
    "revision": null
  }, {
    "url": "assets/index-cc3GCXfk.css",
    "revision": null
  }, {
    "url": "assets/Icon-BPkumGt3.js",
    "revision": null
  }, {
    "url": "assets/HomeView-CDMbIGz9.css",
    "revision": null
  }, {
    "url": "assets/HomeView--7OO3ZTt.js",
    "revision": null
  }, {
    "url": "assets/heart-ID1nT3Wf.js",
    "revision": null
  }, {
    "url": "assets/FriendsView-DRTyW6_c.js",
    "revision": null
  }, {
    "url": "assets/FriendsView-B-Yj2s1T.css",
    "revision": null
  }, {
    "url": "assets/FollowingView-COgSouVY.js",
    "revision": null
  }, {
    "url": "assets/FollowingView-BHZZtRiw.css",
    "revision": null
  }, {
    "url": "assets/FeaturedView-CVaecB0m.js",
    "revision": null
  }, {
    "url": "assets/FeaturedView-CgY5p2nZ.css",
    "revision": null
  }, {
    "url": "assets/fabric-Yc7L3zxX.js",
    "revision": null
  }, {
    "url": "assets/EditorView-Q1E1ap9v.js",
    "revision": null
  }, {
    "url": "assets/EditorView-CMOChdRw.css",
    "revision": null
  }, {
    "url": "assets/CameraView-CsDjlkxS.js",
    "revision": null
  }, {
    "url": "assets/camera-BKUXxhM6.js",
    "revision": null
  }, {
    "url": "assets/CallbackView-Cp6Tu5sD.js",
    "revision": null
  }, {
    "url": "assets/aperture-DWQx20mT.js",
    "revision": null
  }, {
    "url": "assets/agreementConfig-CakcFnmS.js",
    "revision": null
  }, {
    "url": "assets/AboutModal-Bv05itDb.js",
    "revision": null
  }, {
    "url": "assets/AboutModal-BhNfHUnG.css",
    "revision": null
  }, {
    "url": "favicon.svg",
    "revision": "cf5b034a7164d16730eb95453cc181da"
  }, {
    "url": "logo.svg",
    "revision": "12987898141796f1dc418bad77dda6f1"
  }, {
    "url": "manifest.webmanifest",
    "revision": "46d2239c631aefc15728c12bb18fce75"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("/posecraft/index.html"), {
    denylist: [/^\/posecraft\/models\//]
  }));

}));
