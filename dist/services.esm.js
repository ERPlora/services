var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i7 = decorators.length - 1, decorator; i7 >= 0; i7--)
    if (decorator = decorators[i7])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};

// @lit-labs/ssr-dom-shim/lib/element-internals.js
var ElementInternalsShim = class ElementInternals {
  get shadowRoot() {
    return this.__host.__shadowRoot;
  }
  constructor(_host) {
    this.ariaActiveDescendantElement = null;
    this.ariaAtomic = "";
    this.ariaAutoComplete = "";
    this.ariaBrailleLabel = "";
    this.ariaBrailleRoleDescription = "";
    this.ariaBusy = "";
    this.ariaChecked = "";
    this.ariaColCount = "";
    this.ariaColIndex = "";
    this.ariaColIndexText = "";
    this.ariaColSpan = "";
    this.ariaControlsElements = null;
    this.ariaCurrent = "";
    this.ariaDescribedByElements = null;
    this.ariaDescription = "";
    this.ariaDetailsElements = null;
    this.ariaDisabled = "";
    this.ariaErrorMessageElements = null;
    this.ariaExpanded = "";
    this.ariaFlowToElements = null;
    this.ariaHasPopup = "";
    this.ariaHidden = "";
    this.ariaInvalid = "";
    this.ariaKeyShortcuts = "";
    this.ariaLabel = "";
    this.ariaLabelledByElements = null;
    this.ariaLevel = "";
    this.ariaLive = "";
    this.ariaModal = "";
    this.ariaMultiLine = "";
    this.ariaMultiSelectable = "";
    this.ariaOrientation = "";
    this.ariaOwnsElements = null;
    this.ariaPlaceholder = "";
    this.ariaPosInSet = "";
    this.ariaPressed = "";
    this.ariaReadOnly = "";
    this.ariaRelevant = "";
    this.ariaRequired = "";
    this.ariaRoleDescription = "";
    this.ariaRowCount = "";
    this.ariaRowIndex = "";
    this.ariaRowIndexText = "";
    this.ariaRowSpan = "";
    this.ariaSelected = "";
    this.ariaSetSize = "";
    this.ariaSort = "";
    this.ariaValueMax = "";
    this.ariaValueMin = "";
    this.ariaValueNow = "";
    this.ariaValueText = "";
    this.role = "";
    this.form = null;
    this.labels = [];
    this.states = /* @__PURE__ */ new Set();
    this.validationMessage = "";
    this.validity = {};
    this.willValidate = true;
    this.__host = _host;
  }
  checkValidity() {
    console.warn("`ElementInternals.checkValidity()` was called on the server.This method always returns true.");
    return true;
  }
  reportValidity() {
    return true;
  }
  setFormValue() {
  }
  setValidity() {
  }
};

// @lit-labs/ssr-dom-shim/lib/events.js
var __classPrivateFieldSet = function(receiver, state, value, kind, f3) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f3) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f3 : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f3.call(receiver, value) : f3 ? f3.value = value : state.set(receiver, value), value;
};
var __classPrivateFieldGet = function(receiver, state, kind, f3) {
  if (kind === "a" && !f3) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f3 : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f3 : kind === "a" ? f3.call(receiver) : f3 ? f3.value : state.get(receiver);
};
var _Event_cancelable;
var _Event_bubbles;
var _Event_composed;
var _Event_defaultPrevented;
var _Event_timestamp;
var _Event_propagationStopped;
var _Event_type;
var _Event_target;
var _Event_isBeingDispatched;
var _a;
var _CustomEvent_detail;
var _b;
var NONE = 0;
var CAPTURING_PHASE = 1;
var AT_TARGET = 2;
var BUBBLING_PHASE = 3;
var enumerableProperty = { __proto__: null };
enumerableProperty.enumerable = true;
Object.freeze(enumerableProperty);
var EventShim = (_a = class Event {
  constructor(type, options = {}) {
    _Event_cancelable.set(this, false);
    _Event_bubbles.set(this, false);
    _Event_composed.set(this, false);
    _Event_defaultPrevented.set(this, false);
    _Event_timestamp.set(this, Date.now());
    _Event_propagationStopped.set(this, false);
    _Event_type.set(this, void 0);
    _Event_target.set(this, void 0);
    _Event_isBeingDispatched.set(this, void 0);
    this.NONE = NONE;
    this.CAPTURING_PHASE = CAPTURING_PHASE;
    this.AT_TARGET = AT_TARGET;
    this.BUBBLING_PHASE = BUBBLING_PHASE;
    if (arguments.length === 0)
      throw new Error(`The type argument must be specified`);
    if (typeof options !== "object" || !options) {
      throw new Error(`The "options" argument must be an object`);
    }
    const { bubbles, cancelable, composed } = options;
    __classPrivateFieldSet(this, _Event_cancelable, !!cancelable, "f");
    __classPrivateFieldSet(this, _Event_bubbles, !!bubbles, "f");
    __classPrivateFieldSet(this, _Event_composed, !!composed, "f");
    __classPrivateFieldSet(this, _Event_type, `${type}`, "f");
    __classPrivateFieldSet(this, _Event_target, null, "f");
    __classPrivateFieldSet(this, _Event_isBeingDispatched, false, "f");
  }
  initEvent(_type, _bubbles, _cancelable) {
    throw new Error("Method not implemented.");
  }
  stopImmediatePropagation() {
    this.stopPropagation();
  }
  preventDefault() {
    __classPrivateFieldSet(this, _Event_defaultPrevented, true, "f");
  }
  get target() {
    return __classPrivateFieldGet(this, _Event_target, "f");
  }
  get currentTarget() {
    return __classPrivateFieldGet(this, _Event_target, "f");
  }
  get srcElement() {
    return __classPrivateFieldGet(this, _Event_target, "f");
  }
  get type() {
    return __classPrivateFieldGet(this, _Event_type, "f");
  }
  get cancelable() {
    return __classPrivateFieldGet(this, _Event_cancelable, "f");
  }
  get defaultPrevented() {
    return __classPrivateFieldGet(this, _Event_cancelable, "f") && __classPrivateFieldGet(this, _Event_defaultPrevented, "f");
  }
  get timeStamp() {
    return __classPrivateFieldGet(this, _Event_timestamp, "f");
  }
  composedPath() {
    return __classPrivateFieldGet(this, _Event_isBeingDispatched, "f") ? [__classPrivateFieldGet(this, _Event_target, "f")] : [];
  }
  get returnValue() {
    return !__classPrivateFieldGet(this, _Event_cancelable, "f") || !__classPrivateFieldGet(this, _Event_defaultPrevented, "f");
  }
  get bubbles() {
    return __classPrivateFieldGet(this, _Event_bubbles, "f");
  }
  get composed() {
    return __classPrivateFieldGet(this, _Event_composed, "f");
  }
  get eventPhase() {
    return __classPrivateFieldGet(this, _Event_isBeingDispatched, "f") ? _a.AT_TARGET : _a.NONE;
  }
  get cancelBubble() {
    return __classPrivateFieldGet(this, _Event_propagationStopped, "f");
  }
  set cancelBubble(value) {
    if (value) {
      __classPrivateFieldSet(this, _Event_propagationStopped, true, "f");
    }
  }
  stopPropagation() {
    __classPrivateFieldSet(this, _Event_propagationStopped, true, "f");
  }
  get isTrusted() {
    return false;
  }
}, _Event_cancelable = /* @__PURE__ */ new WeakMap(), _Event_bubbles = /* @__PURE__ */ new WeakMap(), _Event_composed = /* @__PURE__ */ new WeakMap(), _Event_defaultPrevented = /* @__PURE__ */ new WeakMap(), _Event_timestamp = /* @__PURE__ */ new WeakMap(), _Event_propagationStopped = /* @__PURE__ */ new WeakMap(), _Event_type = /* @__PURE__ */ new WeakMap(), _Event_target = /* @__PURE__ */ new WeakMap(), _Event_isBeingDispatched = /* @__PURE__ */ new WeakMap(), _a.NONE = NONE, _a.CAPTURING_PHASE = CAPTURING_PHASE, _a.AT_TARGET = AT_TARGET, _a.BUBBLING_PHASE = BUBBLING_PHASE, _a);
Object.defineProperties(EventShim.prototype, {
  initEvent: enumerableProperty,
  stopImmediatePropagation: enumerableProperty,
  preventDefault: enumerableProperty,
  target: enumerableProperty,
  currentTarget: enumerableProperty,
  srcElement: enumerableProperty,
  type: enumerableProperty,
  cancelable: enumerableProperty,
  defaultPrevented: enumerableProperty,
  timeStamp: enumerableProperty,
  composedPath: enumerableProperty,
  returnValue: enumerableProperty,
  bubbles: enumerableProperty,
  composed: enumerableProperty,
  eventPhase: enumerableProperty,
  cancelBubble: enumerableProperty,
  stopPropagation: enumerableProperty,
  isTrusted: enumerableProperty
});
var CustomEventShim = (_b = class CustomEvent2 extends EventShim {
  constructor(type, options = {}) {
    super(type, options);
    _CustomEvent_detail.set(this, void 0);
    __classPrivateFieldSet(this, _CustomEvent_detail, options?.detail ?? null, "f");
  }
  initCustomEvent(_type, _bubbles, _cancelable, _detail) {
    throw new Error("Method not implemented.");
  }
  get detail() {
    return __classPrivateFieldGet(this, _CustomEvent_detail, "f");
  }
}, _CustomEvent_detail = /* @__PURE__ */ new WeakMap(), _b);
Object.defineProperties(CustomEventShim.prototype, {
  detail: enumerableProperty
});
var EventShimWithRealType = EventShim;
var CustomEventShimWithRealType = CustomEventShim;

// @lit-labs/ssr-dom-shim/lib/css.js
var _a2;
var CSSRuleShim = (_a2 = class CSSRule {
  constructor() {
    this.STYLE_RULE = 1;
    this.CHARSET_RULE = 2;
    this.IMPORT_RULE = 3;
    this.MEDIA_RULE = 4;
    this.FONT_FACE_RULE = 5;
    this.PAGE_RULE = 6;
    this.NAMESPACE_RULE = 10;
    this.KEYFRAMES_RULE = 7;
    this.KEYFRAME_RULE = 8;
    this.SUPPORTS_RULE = 12;
    this.COUNTER_STYLE_RULE = 11;
    this.FONT_FEATURE_VALUES_RULE = 14;
    this.MARGIN_RULE = 9;
    this.__parentStyleSheet = null;
    this.cssText = "";
  }
  get parentRule() {
    return null;
  }
  get parentStyleSheet() {
    return this.__parentStyleSheet;
  }
  get type() {
    return 0;
  }
}, _a2.STYLE_RULE = 1, _a2.CHARSET_RULE = 2, _a2.IMPORT_RULE = 3, _a2.MEDIA_RULE = 4, _a2.FONT_FACE_RULE = 5, _a2.PAGE_RULE = 6, _a2.NAMESPACE_RULE = 10, _a2.KEYFRAMES_RULE = 7, _a2.KEYFRAME_RULE = 8, _a2.SUPPORTS_RULE = 12, _a2.COUNTER_STYLE_RULE = 11, _a2.FONT_FEATURE_VALUES_RULE = 14, _a2.MARGIN_RULE = 9, _a2);

// @lit-labs/ssr-dom-shim/index.js
globalThis.Event ??= EventShimWithRealType;
globalThis.CustomEvent ??= CustomEventShimWithRealType;
var constructionToken = Symbol();
var isCaptureEventListener = (options) => typeof options === "boolean" ? options : options?.capture ?? false;
var enumerableProperty2 = { __proto__: null };
enumerableProperty2.enumerable = true;
Object.freeze(enumerableProperty2);
var EventTarget = class {
  constructor() {
    this.__eventListeners = /* @__PURE__ */ new Map();
    this.__captureEventListeners = /* @__PURE__ */ new Map();
  }
  addEventListener(type, callback, options) {
    if (callback === void 0 || callback === null) {
      return;
    }
    const eventListenersMap = isCaptureEventListener(options) ? this.__captureEventListeners : this.__eventListeners;
    let eventListeners = eventListenersMap.get(type);
    if (eventListeners === void 0) {
      eventListeners = /* @__PURE__ */ new Map();
      eventListenersMap.set(type, eventListeners);
    } else if (eventListeners.has(callback)) {
      return;
    }
    const normalizedOptions = typeof options === "object" && options ? options : {};
    normalizedOptions.signal?.addEventListener("abort", () => this.removeEventListener(type, callback, options));
    eventListeners.set(callback, normalizedOptions ?? {});
  }
  removeEventListener(type, callback, options) {
    if (callback === void 0 || callback === null) {
      return;
    }
    const eventListenersMap = isCaptureEventListener(options) ? this.__captureEventListeners : this.__eventListeners;
    const eventListeners = eventListenersMap.get(type);
    if (eventListeners !== void 0) {
      eventListeners.delete(callback);
      if (!eventListeners.size) {
        eventListenersMap.delete(type);
      }
    }
  }
  dispatchEvent(event) {
    let composedPath = this.__resolveFullEventPath();
    if (!event.composed && this.__host) {
      composedPath = composedPath.slice(0, composedPath.indexOf(this.__host));
    }
    let stopPropagation = false;
    let stopImmediatePropagation = false;
    let eventPhase = EventShimWithRealType.NONE;
    let target = null;
    let tmpTarget = null;
    let currentTarget = null;
    const originalStopPropagation = event.stopPropagation;
    const originalStopImmediatePropagation = event.stopImmediatePropagation;
    Object.defineProperties(event, {
      target: {
        get() {
          return target ?? tmpTarget;
        },
        ...enumerableProperty2
      },
      srcElement: {
        get() {
          return event.target;
        },
        ...enumerableProperty2
      },
      currentTarget: {
        get() {
          return currentTarget;
        },
        ...enumerableProperty2
      },
      eventPhase: {
        get() {
          return eventPhase;
        },
        ...enumerableProperty2
      },
      composedPath: {
        value: () => composedPath,
        ...enumerableProperty2
      },
      stopPropagation: {
        value: () => {
          stopPropagation = true;
          originalStopPropagation.call(event);
        },
        ...enumerableProperty2
      },
      stopImmediatePropagation: {
        value: () => {
          stopImmediatePropagation = true;
          originalStopImmediatePropagation.call(event);
        },
        ...enumerableProperty2
      }
    });
    const invokeEventListener = (listener, options, eventListenerMap) => {
      if (typeof listener === "function") {
        listener(event);
      } else if (typeof listener?.handleEvent === "function") {
        listener.handleEvent(event);
      }
      if (options.once) {
        eventListenerMap.delete(listener);
      }
    };
    const finishDispatch = () => {
      currentTarget = null;
      eventPhase = EventShimWithRealType.NONE;
      return !event.defaultPrevented;
    };
    const captureEventPath = composedPath.slice().reverse();
    target = !this.__host || !event.composed ? this : null;
    const retarget = (eventTargets) => {
      tmpTarget = this;
      while (tmpTarget.__host && eventTargets.includes(tmpTarget.__host)) {
        tmpTarget = tmpTarget.__host;
      }
    };
    for (const eventTarget of captureEventPath) {
      if (!target && (!tmpTarget || tmpTarget === eventTarget.__host)) {
        retarget(captureEventPath.slice(captureEventPath.indexOf(eventTarget)));
      }
      currentTarget = eventTarget;
      eventPhase = eventTarget === event.target ? EventShimWithRealType.AT_TARGET : EventShimWithRealType.CAPTURING_PHASE;
      const captureEventListeners = eventTarget.__captureEventListeners.get(event.type);
      if (captureEventListeners) {
        for (const [listener, options] of captureEventListeners) {
          invokeEventListener(listener, options, captureEventListeners);
          if (stopImmediatePropagation) {
            return finishDispatch();
          }
        }
      }
      if (stopPropagation) {
        return finishDispatch();
      }
    }
    const bubbleEventPath = event.bubbles ? composedPath : [this];
    tmpTarget = null;
    for (const eventTarget of bubbleEventPath) {
      if (!target && (!tmpTarget || eventTarget === tmpTarget.__host)) {
        retarget(bubbleEventPath.slice(0, bubbleEventPath.indexOf(eventTarget) + 1));
      }
      currentTarget = eventTarget;
      eventPhase = eventTarget === event.target ? EventShimWithRealType.AT_TARGET : EventShimWithRealType.BUBBLING_PHASE;
      const eventListeners = eventTarget.__eventListeners.get(event.type);
      if (eventListeners) {
        for (const [listener, options] of eventListeners) {
          invokeEventListener(listener, options, eventListeners);
          if (stopImmediatePropagation) {
            return finishDispatch();
          }
        }
      }
      if (stopPropagation) {
        return finishDispatch();
      }
    }
    return finishDispatch();
  }
  __resolveFullEventPath() {
    if (this.__eventPathCache) {
      return this.__eventPathCache;
    } else if (!this.__eventTargetParent) {
      return this.__eventPathCache = [this, documentShim, windowShim];
    } else {
      return this.__eventPathCache = [
        this,
        ...this.__eventTargetParent.__resolveFullEventPath()
      ];
    }
  }
};
var attributes = /* @__PURE__ */ new WeakMap();
var attributesForElement = (element) => {
  let attrs = attributes.get(element);
  if (attrs === void 0) {
    attributes.set(element, attrs = /* @__PURE__ */ new Map());
  }
  return attrs;
};
var NodeShim = class Node2 extends EventTarget {
  getRootNode(options) {
    if (options?.composed) {
      return document2;
    }
    const host = this.__host;
    return host?.__shadowRoot ?? document2;
  }
};
var DocumentShim = class Document2 extends NodeShim {
  get adoptedStyleSheets() {
    return [];
  }
  createTreeWalker() {
    return {};
  }
  createTextNode() {
    return {};
  }
  createElement() {
    return {};
  }
};
var documentShim = new DocumentShim();
var document2 = documentShim;
var WindowShim = class Window extends NodeShim {
  constructor(token) {
    super();
    if (token !== constructionToken) {
      throw new TypeError("Illegal constructor");
    }
    Object.assign(this, globalThis, {
      CustomElementRegistry,
      customElements: customElements2,
      document: document2,
      Document: DocumentShim,
      Element: ElementShim,
      EventTarget,
      HTMLElement: HTMLElementShim,
      Node: NodeShim,
      ShadowRoot: ShadowRootShim,
      window: this,
      Window: WindowShim
    });
  }
};
var ElementShim = class Element extends NodeShim {
  constructor() {
    super(...arguments);
    this.__shadowRootMode = null;
    this.__shadowRoot = null;
    this.__internals = null;
  }
  get attributes() {
    return Array.from(attributesForElement(this)).map(([name, value]) => ({
      name,
      value
    }));
  }
  get shadowRoot() {
    if (this.__shadowRootMode === "closed") {
      return null;
    }
    return this.__shadowRoot;
  }
  get localName() {
    return this.constructor.__localName;
  }
  get tagName() {
    return this.localName?.toUpperCase();
  }
  setAttribute(name, value) {
    attributesForElement(this).set(name, String(value));
  }
  removeAttribute(name) {
    attributesForElement(this).delete(name);
  }
  toggleAttribute(name, force) {
    if (this.hasAttribute(name)) {
      if (force === void 0 || !force) {
        this.removeAttribute(name);
        return false;
      }
    } else {
      if (force === void 0 || force) {
        this.setAttribute(name, "");
        return true;
      } else {
        return false;
      }
    }
    return true;
  }
  hasAttribute(name) {
    return attributesForElement(this).has(name);
  }
  attachShadow(init) {
    this.__shadowRootMode = init.mode;
    const shadowRoot = new ShadowRootShim(constructionToken, init);
    shadowRoot.__eventTargetParent = this;
    shadowRoot.__host = this;
    return this.__shadowRoot = shadowRoot;
  }
  attachInternals() {
    if (this.__internals !== null) {
      throw new Error(`Failed to execute 'attachInternals' on 'HTMLElement': ElementInternals for the specified element was already attached.`);
    }
    const internals = new ElementInternalsShim(this);
    this.__internals = internals;
    return internals;
  }
  getAttribute(name) {
    const value = attributesForElement(this).get(name);
    return value ?? null;
  }
};
var HTMLElementShim = class HTMLElement2 extends ElementShim {
};
var HTMLElementShimWithRealType = HTMLElementShim;
var ShadowRootShim = class ShadowRoot extends NodeShim {
  get host() {
    return this.__host;
  }
  constructor(constructionToken2, init) {
    super();
    if (constructionToken2 !== constructionToken2) {
      throw new TypeError("Illegal constructor");
    }
    this.mode = init.mode;
  }
};
globalThis.litServerRoot ??= Object.defineProperty(new HTMLElementShimWithRealType(), "localName", {
  // Patch localName (and tagName) to return a unique name.
  get() {
    return "lit-server-root";
  }
});
function promiseWithResolvers() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
var CustomElementRegistry = class {
  constructor() {
    this.__definitions = /* @__PURE__ */ new Map();
    this.__reverseDefinitions = /* @__PURE__ */ new Map();
    this.__pendingWhenDefineds = /* @__PURE__ */ new Map();
  }
  define(name, ctor) {
    if (this.__definitions.has(name)) {
      if (true) {
        console.warn(`'CustomElementRegistry' already has "${name}" defined. This may have been caused by live reload or hot module replacement in which case it can be safely ignored.
Make sure to test your application with a production build as repeat registrations will throw in production.`);
      } else {
        throw new Error(`Failed to execute 'define' on 'CustomElementRegistry': the name "${name}" has already been used with this registry`);
      }
    }
    if (this.__reverseDefinitions.has(ctor)) {
      throw new Error(`Failed to execute 'define' on 'CustomElementRegistry': the constructor has already been used with this registry for the tag name ${this.__reverseDefinitions.get(ctor)}`);
    }
    ctor.__localName = name;
    this.__definitions.set(name, {
      ctor,
      // Note it's important we read `observedAttributes` in case it is a getter
      // with side-effects, as is the case in Lit, where it triggers class
      // finalization.
      //
      // TODO(aomarks) To be spec compliant, we should also capture the
      // registration-time lifecycle methods like `connectedCallback`. For them
      // to be actually accessible to e.g. the Lit SSR element renderer, though,
      // we'd need to introduce a new API for accessing them (since `get` only
      // returns the constructor).
      observedAttributes: ctor.observedAttributes ?? []
    });
    this.__reverseDefinitions.set(ctor, name);
    this.__pendingWhenDefineds.get(name)?.resolve(ctor);
    this.__pendingWhenDefineds.delete(name);
  }
  get(name) {
    const definition = this.__definitions.get(name);
    return definition?.ctor;
  }
  getName(ctor) {
    return this.__reverseDefinitions.get(ctor) ?? null;
  }
  initialize(_root) {
    throw new Error(`customElements.initialize is not currently supported in SSR. Please file a bug if you need it.`);
  }
  upgrade(_element) {
    throw new Error(`customElements.upgrade is not currently supported in SSR. Please file a bug if you need it.`);
  }
  async whenDefined(name) {
    const definition = this.__definitions.get(name);
    if (definition) {
      return definition.ctor;
    }
    let withResolvers = this.__pendingWhenDefineds.get(name);
    if (!withResolvers) {
      withResolvers = promiseWithResolvers();
      this.__pendingWhenDefineds.set(name, withResolvers);
    }
    return withResolvers.promise;
  }
};
var CustomElementRegistryShimWithRealType = CustomElementRegistry;
var customElements2 = new CustomElementRegistryShimWithRealType();
var windowShim = new WindowShim(constructionToken);

// @lit/reactive-element/node/css-tag.js
var t = globalThis;
var e = t.ShadowRoot && (void 0 === t.ShadyCSS || t.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype;
var s = Symbol();
var o = /* @__PURE__ */ new WeakMap();
var n = class {
  constructor(t5, e6, o7) {
    if (this._$cssResult$ = true, o7 !== s) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = t5, this.t = e6;
  }
  get styleSheet() {
    let t5 = this.o;
    const s5 = this.t;
    if (e && void 0 === t5) {
      const e6 = void 0 !== s5 && 1 === s5.length;
      e6 && (t5 = o.get(s5)), void 0 === t5 && ((this.o = t5 = new CSSStyleSheet()).replaceSync(this.cssText), e6 && o.set(s5, t5));
    }
    return t5;
  }
  toString() {
    return this.cssText;
  }
};
var r = (t5) => new n("string" == typeof t5 ? t5 : t5 + "", void 0, s);
var i = (t5, ...e6) => {
  const o7 = 1 === t5.length ? t5[0] : e6.reduce((e7, s5, o8) => e7 + ((t6) => {
    if (true === t6._$cssResult$) return t6.cssText;
    if ("number" == typeof t6) return t6;
    throw Error("Value passed to 'css' function must be a 'css' function result: " + t6 + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
  })(s5) + t5[o8 + 1], t5[0]);
  return new n(o7, t5, s);
};
var S = (s5, o7) => {
  if (e) s5.adoptedStyleSheets = o7.map((t5) => t5 instanceof CSSStyleSheet ? t5 : t5.styleSheet);
  else for (const e6 of o7) {
    const o8 = document.createElement("style"), n6 = t.litNonce;
    void 0 !== n6 && o8.setAttribute("nonce", n6), o8.textContent = e6.cssText, s5.appendChild(o8);
  }
};
var c = e || void 0 === t.CSSStyleSheet ? (t5) => t5 : (t5) => t5 instanceof CSSStyleSheet ? ((t6) => {
  let e6 = "";
  for (const s5 of t6.cssRules) e6 += s5.cssText;
  return r(e6);
})(t5) : t5;

// @lit/reactive-element/node/reactive-element.js
var { is: h, defineProperty: r2, getOwnPropertyDescriptor: o2, getOwnPropertyNames: n2, getOwnPropertySymbols: a, getPrototypeOf: c2 } = Object;
var l = globalThis;
l.customElements ??= customElements2;
var p = l.trustedTypes;
var d = p ? p.emptyScript : "";
var u = l.reactiveElementPolyfillSupport;
var f = (t5, s5) => t5;
var b = { toAttribute(t5, s5) {
  switch (s5) {
    case Boolean:
      t5 = t5 ? d : null;
      break;
    case Object:
    case Array:
      t5 = null == t5 ? t5 : JSON.stringify(t5);
  }
  return t5;
}, fromAttribute(t5, s5) {
  let i7 = t5;
  switch (s5) {
    case Boolean:
      i7 = null !== t5;
      break;
    case Number:
      i7 = null === t5 ? null : Number(t5);
      break;
    case Object:
    case Array:
      try {
        i7 = JSON.parse(t5);
      } catch (t6) {
        i7 = null;
      }
  }
  return i7;
} };
var m = (t5, s5) => !h(t5, s5);
var y = { attribute: true, type: String, converter: b, reflect: false, useDefault: false, hasChanged: m };
Symbol.metadata ??= Symbol("metadata"), l.litPropertyMetadata ??= /* @__PURE__ */ new WeakMap();
var g = class extends (globalThis.HTMLElement ?? HTMLElementShimWithRealType) {
  static addInitializer(t5) {
    this._$Ei(), (this.l ??= []).push(t5);
  }
  static get observedAttributes() {
    return this.finalize(), this._$Eh && [...this._$Eh.keys()];
  }
  static createProperty(t5, s5 = y) {
    if (s5.state && (s5.attribute = false), this._$Ei(), this.prototype.hasOwnProperty(t5) && ((s5 = Object.create(s5)).wrapped = true), this.elementProperties.set(t5, s5), !s5.noAccessor) {
      const i7 = Symbol(), e6 = this.getPropertyDescriptor(t5, i7, s5);
      void 0 !== e6 && r2(this.prototype, t5, e6);
    }
  }
  static getPropertyDescriptor(t5, s5, i7) {
    const { get: e6, set: h4 } = o2(this.prototype, t5) ?? { get() {
      return this[s5];
    }, set(t6) {
      this[s5] = t6;
    } };
    return { get: e6, set(s6) {
      const r6 = e6?.call(this);
      h4?.call(this, s6), this.requestUpdate(t5, r6, i7);
    }, configurable: true, enumerable: true };
  }
  static getPropertyOptions(t5) {
    return this.elementProperties.get(t5) ?? y;
  }
  static _$Ei() {
    if (this.hasOwnProperty(f("elementProperties"))) return;
    const t5 = c2(this);
    t5.finalize(), void 0 !== t5.l && (this.l = [...t5.l]), this.elementProperties = new Map(t5.elementProperties);
  }
  static finalize() {
    if (this.hasOwnProperty(f("finalized"))) return;
    if (this.finalized = true, this._$Ei(), this.hasOwnProperty(f("properties"))) {
      const t6 = this.properties, s5 = [...n2(t6), ...a(t6)];
      for (const i7 of s5) this.createProperty(i7, t6[i7]);
    }
    const t5 = this[Symbol.metadata];
    if (null !== t5) {
      const s5 = litPropertyMetadata.get(t5);
      if (void 0 !== s5) for (const [t6, i7] of s5) this.elementProperties.set(t6, i7);
    }
    this._$Eh = /* @__PURE__ */ new Map();
    for (const [t6, s5] of this.elementProperties) {
      const i7 = this._$Eu(t6, s5);
      void 0 !== i7 && this._$Eh.set(i7, t6);
    }
    this.elementStyles = this.finalizeStyles(this.styles);
  }
  static finalizeStyles(t5) {
    const s5 = [];
    if (Array.isArray(t5)) {
      const e6 = new Set(t5.flat(1 / 0).reverse());
      for (const t6 of e6) s5.unshift(c(t6));
    } else void 0 !== t5 && s5.push(c(t5));
    return s5;
  }
  static _$Eu(t5, s5) {
    const i7 = s5.attribute;
    return false === i7 ? void 0 : "string" == typeof i7 ? i7 : "string" == typeof t5 ? t5.toLowerCase() : void 0;
  }
  constructor() {
    super(), this._$Ep = void 0, this.isUpdatePending = false, this.hasUpdated = false, this._$Em = null, this._$Ev();
  }
  _$Ev() {
    this._$ES = new Promise((t5) => this.enableUpdating = t5), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), this.constructor.l?.forEach((t5) => t5(this));
  }
  addController(t5) {
    (this._$EO ??= /* @__PURE__ */ new Set()).add(t5), void 0 !== this.renderRoot && this.isConnected && t5.hostConnected?.();
  }
  removeController(t5) {
    this._$EO?.delete(t5);
  }
  _$E_() {
    const t5 = /* @__PURE__ */ new Map(), s5 = this.constructor.elementProperties;
    for (const i7 of s5.keys()) this.hasOwnProperty(i7) && (t5.set(i7, this[i7]), delete this[i7]);
    t5.size > 0 && (this._$Ep = t5);
  }
  createRenderRoot() {
    const t5 = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
    return S(t5, this.constructor.elementStyles), t5;
  }
  connectedCallback() {
    this.renderRoot ??= this.createRenderRoot(), this.enableUpdating(true), this._$EO?.forEach((t5) => t5.hostConnected?.());
  }
  enableUpdating(t5) {
  }
  disconnectedCallback() {
    this._$EO?.forEach((t5) => t5.hostDisconnected?.());
  }
  attributeChangedCallback(t5, s5, i7) {
    this._$AK(t5, i7);
  }
  _$ET(t5, s5) {
    const i7 = this.constructor.elementProperties.get(t5), e6 = this.constructor._$Eu(t5, i7);
    if (void 0 !== e6 && true === i7.reflect) {
      const h4 = (void 0 !== i7.converter?.toAttribute ? i7.converter : b).toAttribute(s5, i7.type);
      this._$Em = t5, null == h4 ? this.removeAttribute(e6) : this.setAttribute(e6, h4), this._$Em = null;
    }
  }
  _$AK(t5, s5) {
    const i7 = this.constructor, e6 = i7._$Eh.get(t5);
    if (void 0 !== e6 && this._$Em !== e6) {
      const t6 = i7.getPropertyOptions(e6), h4 = "function" == typeof t6.converter ? { fromAttribute: t6.converter } : void 0 !== t6.converter?.fromAttribute ? t6.converter : b;
      this._$Em = e6;
      const r6 = h4.fromAttribute(s5, t6.type);
      this[e6] = r6 ?? this._$Ej?.get(e6) ?? r6, this._$Em = null;
    }
  }
  requestUpdate(t5, s5, i7, e6 = false, h4) {
    if (void 0 !== t5) {
      const r6 = this.constructor;
      if (false === e6 && (h4 = this[t5]), i7 ??= r6.getPropertyOptions(t5), !((i7.hasChanged ?? m)(h4, s5) || i7.useDefault && i7.reflect && h4 === this._$Ej?.get(t5) && !this.hasAttribute(r6._$Eu(t5, i7)))) return;
      this.C(t5, s5, i7);
    }
    false === this.isUpdatePending && (this._$ES = this._$EP());
  }
  C(t5, s5, { useDefault: i7, reflect: e6, wrapped: h4 }, r6) {
    i7 && !(this._$Ej ??= /* @__PURE__ */ new Map()).has(t5) && (this._$Ej.set(t5, r6 ?? s5 ?? this[t5]), true !== h4 || void 0 !== r6) || (this._$AL.has(t5) || (this.hasUpdated || i7 || (s5 = void 0), this._$AL.set(t5, s5)), true === e6 && this._$Em !== t5 && (this._$Eq ??= /* @__PURE__ */ new Set()).add(t5));
  }
  async _$EP() {
    this.isUpdatePending = true;
    try {
      await this._$ES;
    } catch (t6) {
      Promise.reject(t6);
    }
    const t5 = this.scheduleUpdate();
    return null != t5 && await t5, !this.isUpdatePending;
  }
  scheduleUpdate() {
    return this.performUpdate();
  }
  performUpdate() {
    if (!this.isUpdatePending) return;
    if (!this.hasUpdated) {
      if (this.renderRoot ??= this.createRenderRoot(), this._$Ep) {
        for (const [t7, s6] of this._$Ep) this[t7] = s6;
        this._$Ep = void 0;
      }
      const t6 = this.constructor.elementProperties;
      if (t6.size > 0) for (const [s6, i7] of t6) {
        const { wrapped: t7 } = i7, e6 = this[s6];
        true !== t7 || this._$AL.has(s6) || void 0 === e6 || this.C(s6, void 0, i7, e6);
      }
    }
    let t5 = false;
    const s5 = this._$AL;
    try {
      t5 = this.shouldUpdate(s5), t5 ? (this.willUpdate(s5), this._$EO?.forEach((t6) => t6.hostUpdate?.()), this.update(s5)) : this._$EM();
    } catch (s6) {
      throw t5 = false, this._$EM(), s6;
    }
    t5 && this._$AE(s5);
  }
  willUpdate(t5) {
  }
  _$AE(t5) {
    this._$EO?.forEach((t6) => t6.hostUpdated?.()), this.hasUpdated || (this.hasUpdated = true, this.firstUpdated(t5)), this.updated(t5);
  }
  _$EM() {
    this._$AL = /* @__PURE__ */ new Map(), this.isUpdatePending = false;
  }
  get updateComplete() {
    return this.getUpdateComplete();
  }
  getUpdateComplete() {
    return this._$ES;
  }
  shouldUpdate(t5) {
    return true;
  }
  update(t5) {
    this._$Eq &&= this._$Eq.forEach((t6) => this._$ET(t6, this[t6])), this._$EM();
  }
  updated(t5) {
  }
  firstUpdated(t5) {
  }
};
g.elementStyles = [], g.shadowRootOptions = { mode: "open" }, g[f("elementProperties")] = /* @__PURE__ */ new Map(), g[f("finalized")] = /* @__PURE__ */ new Map(), u?.({ ReactiveElement: g }), (l.reactiveElementVersions ??= []).push("2.1.2");

// lit-html/lit-html.js
var t2 = globalThis;
var i2 = (t5) => t5;
var s2 = t2.trustedTypes;
var e2 = s2 ? s2.createPolicy("lit-html", { createHTML: (t5) => t5 }) : void 0;
var h2 = "$lit$";
var o3 = `lit$${Math.random().toFixed(9).slice(2)}$`;
var n3 = "?" + o3;
var r3 = `<${n3}>`;
var l2 = document;
var c3 = () => l2.createComment("");
var a2 = (t5) => null === t5 || "object" != typeof t5 && "function" != typeof t5;
var u2 = Array.isArray;
var d2 = (t5) => u2(t5) || "function" == typeof t5?.[Symbol.iterator];
var f2 = "[ 	\n\f\r]";
var v = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g;
var _ = /-->/g;
var m2 = />/g;
var p2 = RegExp(`>|${f2}(?:([^\\s"'>=/]+)(${f2}*=${f2}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g");
var g2 = /'/g;
var $ = /"/g;
var y2 = /^(?:script|style|textarea|title)$/i;
var x = (t5) => (i7, ...s5) => ({ _$litType$: t5, strings: i7, values: s5 });
var b2 = x(1);
var w = x(2);
var T = x(3);
var E = Symbol.for("lit-noChange");
var A = Symbol.for("lit-nothing");
var C = /* @__PURE__ */ new WeakMap();
var P = l2.createTreeWalker(l2, 129);
function V(t5, i7) {
  if (!u2(t5) || !t5.hasOwnProperty("raw")) throw Error("invalid template strings array");
  return void 0 !== e2 ? e2.createHTML(i7) : i7;
}
var N = (t5, i7) => {
  const s5 = t5.length - 1, e6 = [];
  let n6, l3 = 2 === i7 ? "<svg>" : 3 === i7 ? "<math>" : "", c5 = v;
  for (let i8 = 0; i8 < s5; i8++) {
    const s6 = t5[i8];
    let a3, u5, d3 = -1, f3 = 0;
    for (; f3 < s6.length && (c5.lastIndex = f3, u5 = c5.exec(s6), null !== u5); ) f3 = c5.lastIndex, c5 === v ? "!--" === u5[1] ? c5 = _ : void 0 !== u5[1] ? c5 = m2 : void 0 !== u5[2] ? (y2.test(u5[2]) && (n6 = RegExp("</" + u5[2], "g")), c5 = p2) : void 0 !== u5[3] && (c5 = p2) : c5 === p2 ? ">" === u5[0] ? (c5 = n6 ?? v, d3 = -1) : void 0 === u5[1] ? d3 = -2 : (d3 = c5.lastIndex - u5[2].length, a3 = u5[1], c5 = void 0 === u5[3] ? p2 : '"' === u5[3] ? $ : g2) : c5 === $ || c5 === g2 ? c5 = p2 : c5 === _ || c5 === m2 ? c5 = v : (c5 = p2, n6 = void 0);
    const x2 = c5 === p2 && t5[i8 + 1].startsWith("/>") ? " " : "";
    l3 += c5 === v ? s6 + r3 : d3 >= 0 ? (e6.push(a3), s6.slice(0, d3) + h2 + s6.slice(d3) + o3 + x2) : s6 + o3 + (-2 === d3 ? i8 : x2);
  }
  return [V(t5, l3 + (t5[s5] || "<?>") + (2 === i7 ? "</svg>" : 3 === i7 ? "</math>" : "")), e6];
};
var S2 = class _S {
  constructor({ strings: t5, _$litType$: i7 }, e6) {
    let r6;
    this.parts = [];
    let l3 = 0, a3 = 0;
    const u5 = t5.length - 1, d3 = this.parts, [f3, v3] = N(t5, i7);
    if (this.el = _S.createElement(f3, e6), P.currentNode = this.el.content, 2 === i7 || 3 === i7) {
      const t6 = this.el.content.firstChild;
      t6.replaceWith(...t6.childNodes);
    }
    for (; null !== (r6 = P.nextNode()) && d3.length < u5; ) {
      if (1 === r6.nodeType) {
        if (r6.hasAttributes()) for (const t6 of r6.getAttributeNames()) if (t6.endsWith(h2)) {
          const i8 = v3[a3++], s5 = r6.getAttribute(t6).split(o3), e7 = /([.?@])?(.*)/.exec(i8);
          d3.push({ type: 1, index: l3, name: e7[2], strings: s5, ctor: "." === e7[1] ? I : "?" === e7[1] ? L : "@" === e7[1] ? z : H }), r6.removeAttribute(t6);
        } else t6.startsWith(o3) && (d3.push({ type: 6, index: l3 }), r6.removeAttribute(t6));
        if (y2.test(r6.tagName)) {
          const t6 = r6.textContent.split(o3), i8 = t6.length - 1;
          if (i8 > 0) {
            r6.textContent = s2 ? s2.emptyScript : "";
            for (let s5 = 0; s5 < i8; s5++) r6.append(t6[s5], c3()), P.nextNode(), d3.push({ type: 2, index: ++l3 });
            r6.append(t6[i8], c3());
          }
        }
      } else if (8 === r6.nodeType) if (r6.data === n3) d3.push({ type: 2, index: l3 });
      else {
        let t6 = -1;
        for (; -1 !== (t6 = r6.data.indexOf(o3, t6 + 1)); ) d3.push({ type: 7, index: l3 }), t6 += o3.length - 1;
      }
      l3++;
    }
  }
  static createElement(t5, i7) {
    const s5 = l2.createElement("template");
    return s5.innerHTML = t5, s5;
  }
};
function M(t5, i7, s5 = t5, e6) {
  if (i7 === E) return i7;
  let h4 = void 0 !== e6 ? s5._$Co?.[e6] : s5._$Cl;
  const o7 = a2(i7) ? void 0 : i7._$litDirective$;
  return h4?.constructor !== o7 && (h4?._$AO?.(false), void 0 === o7 ? h4 = void 0 : (h4 = new o7(t5), h4._$AT(t5, s5, e6)), void 0 !== e6 ? (s5._$Co ??= [])[e6] = h4 : s5._$Cl = h4), void 0 !== h4 && (i7 = M(t5, h4._$AS(t5, i7.values), h4, e6)), i7;
}
var R = class {
  constructor(t5, i7) {
    this._$AV = [], this._$AN = void 0, this._$AD = t5, this._$AM = i7;
  }
  get parentNode() {
    return this._$AM.parentNode;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  u(t5) {
    const { el: { content: i7 }, parts: s5 } = this._$AD, e6 = (t5?.creationScope ?? l2).importNode(i7, true);
    P.currentNode = e6;
    let h4 = P.nextNode(), o7 = 0, n6 = 0, r6 = s5[0];
    for (; void 0 !== r6; ) {
      if (o7 === r6.index) {
        let i8;
        2 === r6.type ? i8 = new k(h4, h4.nextSibling, this, t5) : 1 === r6.type ? i8 = new r6.ctor(h4, r6.name, r6.strings, this, t5) : 6 === r6.type && (i8 = new Z(h4, this, t5)), this._$AV.push(i8), r6 = s5[++n6];
      }
      o7 !== r6?.index && (h4 = P.nextNode(), o7++);
    }
    return P.currentNode = l2, e6;
  }
  p(t5) {
    let i7 = 0;
    for (const s5 of this._$AV) void 0 !== s5 && (void 0 !== s5.strings ? (s5._$AI(t5, s5, i7), i7 += s5.strings.length - 2) : s5._$AI(t5[i7])), i7++;
  }
};
var k = class _k {
  get _$AU() {
    return this._$AM?._$AU ?? this._$Cv;
  }
  constructor(t5, i7, s5, e6) {
    this.type = 2, this._$AH = A, this._$AN = void 0, this._$AA = t5, this._$AB = i7, this._$AM = s5, this.options = e6, this._$Cv = e6?.isConnected ?? true;
  }
  get parentNode() {
    let t5 = this._$AA.parentNode;
    const i7 = this._$AM;
    return void 0 !== i7 && 11 === t5?.nodeType && (t5 = i7.parentNode), t5;
  }
  get startNode() {
    return this._$AA;
  }
  get endNode() {
    return this._$AB;
  }
  _$AI(t5, i7 = this) {
    t5 = M(this, t5, i7), a2(t5) ? t5 === A || null == t5 || "" === t5 ? (this._$AH !== A && this._$AR(), this._$AH = A) : t5 !== this._$AH && t5 !== E && this._(t5) : void 0 !== t5._$litType$ ? this.$(t5) : void 0 !== t5.nodeType ? this.T(t5) : d2(t5) ? this.k(t5) : this._(t5);
  }
  O(t5) {
    return this._$AA.parentNode.insertBefore(t5, this._$AB);
  }
  T(t5) {
    this._$AH !== t5 && (this._$AR(), this._$AH = this.O(t5));
  }
  _(t5) {
    this._$AH !== A && a2(this._$AH) ? this._$AA.nextSibling.data = t5 : this.T(l2.createTextNode(t5)), this._$AH = t5;
  }
  $(t5) {
    const { values: i7, _$litType$: s5 } = t5, e6 = "number" == typeof s5 ? this._$AC(t5) : (void 0 === s5.el && (s5.el = S2.createElement(V(s5.h, s5.h[0]), this.options)), s5);
    if (this._$AH?._$AD === e6) this._$AH.p(i7);
    else {
      const t6 = new R(e6, this), s6 = t6.u(this.options);
      t6.p(i7), this.T(s6), this._$AH = t6;
    }
  }
  _$AC(t5) {
    let i7 = C.get(t5.strings);
    return void 0 === i7 && C.set(t5.strings, i7 = new S2(t5)), i7;
  }
  k(t5) {
    u2(this._$AH) || (this._$AH = [], this._$AR());
    const i7 = this._$AH;
    let s5, e6 = 0;
    for (const h4 of t5) e6 === i7.length ? i7.push(s5 = new _k(this.O(c3()), this.O(c3()), this, this.options)) : s5 = i7[e6], s5._$AI(h4), e6++;
    e6 < i7.length && (this._$AR(s5 && s5._$AB.nextSibling, e6), i7.length = e6);
  }
  _$AR(t5 = this._$AA.nextSibling, s5) {
    for (this._$AP?.(false, true, s5); t5 !== this._$AB; ) {
      const s6 = i2(t5).nextSibling;
      i2(t5).remove(), t5 = s6;
    }
  }
  setConnected(t5) {
    void 0 === this._$AM && (this._$Cv = t5, this._$AP?.(t5));
  }
};
var H = class {
  get tagName() {
    return this.element.tagName;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  constructor(t5, i7, s5, e6, h4) {
    this.type = 1, this._$AH = A, this._$AN = void 0, this.element = t5, this.name = i7, this._$AM = e6, this.options = h4, s5.length > 2 || "" !== s5[0] || "" !== s5[1] ? (this._$AH = Array(s5.length - 1).fill(new String()), this.strings = s5) : this._$AH = A;
  }
  _$AI(t5, i7 = this, s5, e6) {
    const h4 = this.strings;
    let o7 = false;
    if (void 0 === h4) t5 = M(this, t5, i7, 0), o7 = !a2(t5) || t5 !== this._$AH && t5 !== E, o7 && (this._$AH = t5);
    else {
      const e7 = t5;
      let n6, r6;
      for (t5 = h4[0], n6 = 0; n6 < h4.length - 1; n6++) r6 = M(this, e7[s5 + n6], i7, n6), r6 === E && (r6 = this._$AH[n6]), o7 ||= !a2(r6) || r6 !== this._$AH[n6], r6 === A ? t5 = A : t5 !== A && (t5 += (r6 ?? "") + h4[n6 + 1]), this._$AH[n6] = r6;
    }
    o7 && !e6 && this.j(t5);
  }
  j(t5) {
    t5 === A ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, t5 ?? "");
  }
};
var I = class extends H {
  constructor() {
    super(...arguments), this.type = 3;
  }
  j(t5) {
    this.element[this.name] = t5 === A ? void 0 : t5;
  }
};
var L = class extends H {
  constructor() {
    super(...arguments), this.type = 4;
  }
  j(t5) {
    this.element.toggleAttribute(this.name, !!t5 && t5 !== A);
  }
};
var z = class extends H {
  constructor(t5, i7, s5, e6, h4) {
    super(t5, i7, s5, e6, h4), this.type = 5;
  }
  _$AI(t5, i7 = this) {
    if ((t5 = M(this, t5, i7, 0) ?? A) === E) return;
    const s5 = this._$AH, e6 = t5 === A && s5 !== A || t5.capture !== s5.capture || t5.once !== s5.once || t5.passive !== s5.passive, h4 = t5 !== A && (s5 === A || e6);
    e6 && this.element.removeEventListener(this.name, this, s5), h4 && this.element.addEventListener(this.name, this, t5), this._$AH = t5;
  }
  handleEvent(t5) {
    "function" == typeof this._$AH ? this._$AH.call(this.options?.host ?? this.element, t5) : this._$AH.handleEvent(t5);
  }
};
var Z = class {
  constructor(t5, i7, s5) {
    this.element = t5, this.type = 6, this._$AN = void 0, this._$AM = i7, this.options = s5;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AI(t5) {
    M(this, t5);
  }
};
var j = { M: h2, P: o3, A: n3, C: 1, L: N, R, D: d2, V: M, I: k, H, N: L, U: z, B: I, F: Z };
var B = t2.litHtmlPolyfillSupport;
B?.(S2, k), (t2.litHtmlVersions ??= []).push("3.3.3");
var D = (t5, i7, s5) => {
  const e6 = s5?.renderBefore ?? i7;
  let h4 = e6._$litPart$;
  if (void 0 === h4) {
    const t6 = s5?.renderBefore ?? null;
    e6._$litPart$ = h4 = new k(i7.insertBefore(c3(), t6), t6, void 0, s5 ?? {});
  }
  return h4._$AI(t5), h4;
};

// lit-element/lit-element.js
var s3 = globalThis;
var i3 = class extends g {
  constructor() {
    super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
  }
  createRenderRoot() {
    const t5 = super.createRenderRoot();
    return this.renderOptions.renderBefore ??= t5.firstChild, t5;
  }
  update(t5) {
    const r6 = this.render();
    this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t5), this._$Do = D(r6, this.renderRoot, this.renderOptions);
  }
  connectedCallback() {
    super.connectedCallback(), this._$Do?.setConnected(true);
  }
  disconnectedCallback() {
    super.disconnectedCallback(), this._$Do?.setConnected(false);
  }
  render() {
    return E;
  }
};
i3._$litElement$ = true, i3["finalized"] = true, s3.litElementHydrateSupport?.({ LitElement: i3 });
var o4 = s3.litElementPolyfillSupport;
o4?.({ LitElement: i3 });
(s3.litElementVersions ??= []).push("4.2.2");

// @lit/reactive-element/node/decorators/property.js
var o5 = { attribute: true, type: String, converter: b, reflect: false, hasChanged: m };
var r4 = (t5 = o5, e6, r6) => {
  const { kind: n6, metadata: i7 } = r6;
  let s5 = globalThis.litPropertyMetadata.get(i7);
  if (void 0 === s5 && globalThis.litPropertyMetadata.set(i7, s5 = /* @__PURE__ */ new Map()), "setter" === n6 && ((t5 = Object.create(t5)).wrapped = true), s5.set(r6.name, t5), "accessor" === n6) {
    const { name: o7 } = r6;
    return { set(r7) {
      const n7 = e6.get.call(this);
      e6.set.call(this, r7), this.requestUpdate(o7, n7, t5, true, r7);
    }, init(e7) {
      return void 0 !== e7 && this.C(o7, void 0, t5, e7), e7;
    } };
  }
  if ("setter" === n6) {
    const { name: o7 } = r6;
    return function(r7) {
      const n7 = this[o7];
      e6.call(this, r7), this.requestUpdate(o7, n7, t5, true, r7);
    };
  }
  throw Error("Unsupported decorator location: " + n6);
};
function n4(t5) {
  return (e6, o7) => "object" == typeof o7 ? r4(t5, e6, o7) : ((t6, e7, o8) => {
    const r6 = e7.hasOwnProperty(o8);
    return e7.constructor.createProperty(o8, t6), r6 ? Object.getOwnPropertyDescriptor(e7, o8) : void 0;
  })(t5, e6, o7);
}

// @lit/reactive-element/node/decorators/state.js
function r5(r6) {
  return n4({ ...r6, state: true, attribute: false });
}

// lit-html/directive.js
var t3 = { ATTRIBUTE: 1, CHILD: 2, PROPERTY: 3, BOOLEAN_ATTRIBUTE: 4, EVENT: 5, ELEMENT: 6 };
var e4 = (t5) => (...e6) => ({ _$litDirective$: t5, values: e6 });
var i4 = class {
  constructor(t5) {
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AT(t5, e6, i7) {
    this._$Ct = t5, this._$AM = e6, this._$Ci = i7;
  }
  _$AS(t5, e6) {
    return this.update(t5, e6);
  }
  update(t5, e6) {
    return this.render(...e6);
  }
};

// lit-html/directives/class-map.js
var e5 = e4(class extends i4 {
  constructor(t5) {
    if (super(t5), t5.type !== t3.ATTRIBUTE || "class" !== t5.name || t5.strings?.length > 2) throw Error("`classMap()` can only be used in the `class` attribute and must be the only part in the attribute.");
  }
  render(t5) {
    return " " + Object.keys(t5).filter((s5) => t5[s5]).join(" ") + " ";
  }
  update(s5, [i7]) {
    if (void 0 === this.st) {
      this.st = /* @__PURE__ */ new Set(), void 0 !== s5.strings && (this.nt = new Set(s5.strings.join(" ").split(/\s/).filter((t5) => "" !== t5)));
      for (const t5 in i7) i7[t5] && !this.nt?.has(t5) && this.st.add(t5);
      return this.render(i7);
    }
    const r6 = s5.element.classList;
    for (const t5 of this.st) t5 in i7 || (r6.remove(t5), this.st.delete(t5));
    for (const t5 in i7) {
      const s6 = !!i7[t5];
      s6 === this.st.has(t5) || this.nt?.has(t5) || (s6 ? (r6.add(t5), this.st.add(t5)) : (r6.remove(t5), this.st.delete(t5)));
    }
    return E;
  }
});

// @erplora/outfitkit/dist/define.js
function define(tag, ctor) {
  if (typeof customElements !== "undefined" && !customElements.get(tag)) {
    customElements.define(tag, ctor);
  }
}

// @erplora/outfitkit/dist/shared/icons.js
var rawAdd = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M256 112v288m144-144H112"/></svg>';
var rawAlertCircle = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="currentColor" d="M256 48C141.31 48 48 141.31 48 256s93.31 208 208 208s208-93.31 208-208S370.69 48 256 48m0 319.91a20 20 0 1 1 20-20a20 20 0 0 1-20 20m21.72-201.15l-5.74 122a16 16 0 0 1-32 0l-5.74-121.94v-.05a21.74 21.74 0 1 1 43.44 0Z"/></svg>';
var rawAlertCircleOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32" d="M448 256c0-106-86-192-192-192S64 150 64 256s86 192 192 192s192-86 192-192Z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M250.26 166.05L256 288l5.73-121.95a5.74 5.74 0 0 0-5.79-6h0a5.74 5.74 0 0 0-5.68 6"/><path fill="currentColor" d="M256 367.91a20 20 0 1 1 20-20a20 20 0 0 1-20 20"/></svg>';
var rawAppsOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><rect width="80" height="80" x="64" y="64" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32" rx="40" ry="40"/><rect width="80" height="80" x="216" y="64" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32" rx="40" ry="40"/><rect width="80" height="80" x="368" y="64" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32" rx="40" ry="40"/><rect width="80" height="80" x="64" y="216" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32" rx="40" ry="40"/><rect width="80" height="80" x="216" y="216" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32" rx="40" ry="40"/><rect width="80" height="80" x="368" y="216" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32" rx="40" ry="40"/><rect width="80" height="80" x="64" y="368" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32" rx="40" ry="40"/><rect width="80" height="80" x="216" y="368" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32" rx="40" ry="40"/><rect width="80" height="80" x="368" y="368" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32" rx="40" ry="40"/></svg>';
var rawArchiveOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M80 152v256a40.12 40.12 0 0 0 40 40h272a40.12 40.12 0 0 0 40-40V152"/><rect width="416" height="80" x="48" y="64" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="32" rx="28" ry="28"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="m320 304l-64 64l-64-64m64 41.89V224"/></svg>';
var rawArrowRedoOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="32" d="M448 256L272 88v96C103.57 184 64 304.77 64 424c48.61-62.24 91.6-96 208-96v96Z"/></svg>';
var rawArrowUndoOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="32" d="M240 424v-96c116.4 0 159.39 33.76 208 96c0-119.23-39.57-240-208-240V88L64 256Z"/></svg>';
var rawBackspaceOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="32" d="M135.19 390.14a28.8 28.8 0 0 0 21.68 9.86h246.26A29 29 0 0 0 432 371.13V140.87A29 29 0 0 0 403.13 112H156.87a28.84 28.84 0 0 0-21.67 9.84L46.33 256l88.86 134.11Z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M336.67 192.33L206.66 322.34m130.01 0L206.66 192.33m130.01 0L206.66 322.34m130.01 0L206.66 192.33"/></svg>';
var rawCalendarOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><rect width="416" height="384" x="48" y="80" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="32" rx="48"/><circle cx="296" cy="232" r="24" fill="currentColor"/><circle cx="376" cy="232" r="24" fill="currentColor"/><circle cx="296" cy="312" r="24" fill="currentColor"/><circle cx="376" cy="312" r="24" fill="currentColor"/><circle cx="136" cy="312" r="24" fill="currentColor"/><circle cx="216" cy="312" r="24" fill="currentColor"/><circle cx="136" cy="392" r="24" fill="currentColor"/><circle cx="216" cy="392" r="24" fill="currentColor"/><circle cx="296" cy="392" r="24" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M128 48v32m256-32v32"/><path fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="32" d="M464 160H48"/></svg>';
var rawCheckmarkCircle = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="currentColor" d="M256 48C141.31 48 48 141.31 48 256s93.31 208 208 208s208-93.31 208-208S370.69 48 256 48m108.25 138.29l-134.4 160a16 16 0 0 1-12 5.71h-.27a16 16 0 0 1-11.89-5.3l-57.6-64a16 16 0 1 1 23.78-21.4l45.29 50.32l122.59-145.91a16 16 0 0 1 24.5 20.58"/></svg>';
var rawCheckmarkOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M416 128L192 384l-96-96"/></svg>';
var rawChevronBack = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="48" d="M328 112L184 256l144 144"/></svg>';
var rawChevronBackOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="48" d="M328 112L184 256l144 144"/></svg>';
var rawChevronDownOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="48" d="m112 184l144 144l144-144"/></svg>';
var rawChevronForward = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="48" d="m184 112l144 144l-144 144"/></svg>';
var rawChevronForwardOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="48" d="m184 112l144 144l-144 144"/></svg>';
var rawChevronUpOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="48" d="m112 328l144-144l144 144"/></svg>';
var rawClose = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="currentColor" d="m289.94 256l95-95A24 24 0 0 0 351 127l-95 95l-95-95a24 24 0 0 0-34 34l95 95l-95 95a24 24 0 1 0 34 34l95-95l95 95a24 24 0 0 0 34-34Z"/></svg>';
var rawCloseOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M368 368L144 144m224 0L144 368"/></svg>';
var rawCloudUploadOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M320 367.79h76c55 0 100-29.21 100-83.6s-53-81.47-96-83.6c-8.89-85.06-71-136.8-144-136.8c-69 0-113.44 45.79-128 91.2c-60 5.7-112 43.88-112 106.4s54 106.4 120 106.4h56"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="m320 255.79l-64-64l-64 64m64 192.42V207.79"/></svg>';
var rawCreateOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M384 224v184a40 40 0 0 1-40 40H104a40 40 0 0 1-40-40V168a40 40 0 0 1 40-40h167.48"/><path fill="currentColor" d="M459.94 53.25a16.06 16.06 0 0 0-23.22-.56L424.35 65a8 8 0 0 0 0 11.31l11.34 11.32a8 8 0 0 0 11.34 0l12.06-12c6.1-6.09 6.67-16.01.85-22.38M399.34 90L218.82 270.2a9 9 0 0 0-2.31 3.93L208.16 299a3.91 3.91 0 0 0 4.86 4.86l24.85-8.35a9 9 0 0 0 3.93-2.31L422 112.66a9 9 0 0 0 0-12.66l-9.95-10a9 9 0 0 0-12.71 0"/></svg>';
var rawContractOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M304 416V304h112m-101.8 10.23L432 432M208 96v112H96m101.8-10.23L80 80m336 128H304V96m10.23 101.8L432 80M96 304h112v112m-10.23-101.8L80 432"/></svg>';
var rawDocumentAttachOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M208 64h66.75a32 32 0 0 1 22.62 9.37l141.26 141.26a32 32 0 0 1 9.37 22.62V432a48 48 0 0 1-48 48H192a48 48 0 0 1-48-48V304"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M288 72v120a32 32 0 0 0 32 32h120"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-miterlimit="10" stroke-width="32" d="M160 80v152a23.69 23.69 0 0 1-24 24c-12 0-24-9.1-24-24V88c0-30.59 16.57-56 48-56s48 24.8 48 55.38v138.75c0 43-27.82 77.87-72 77.87s-72-34.86-72-77.87V144"/></svg>';
var rawDocumentOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="32" d="M416 221.25V416a48 48 0 0 1-48 48H144a48 48 0 0 1-48-48V96a48 48 0 0 1 48-48h98.75a32 32 0 0 1 22.62 9.37l141.26 141.26a32 32 0 0 1 9.37 22.62Z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M256 56v120a32 32 0 0 0 32 32h120"/></svg>';
var rawDocumentTextOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="32" d="M416 221.25V416a48 48 0 0 1-48 48H144a48 48 0 0 1-48-48V96a48 48 0 0 1 48-48h98.75a32 32 0 0 1 22.62 9.37l141.26 141.26a32 32 0 0 1 9.37 22.62Z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M256 56v120a32 32 0 0 0 32 32h120m-232 80h160m-160 80h160"/></svg>';
var rawDownloadOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M336 176h40a40 40 0 0 1 40 40v208a40 40 0 0 1-40 40H136a40 40 0 0 1-40-40V216a40 40 0 0 1 40-40h40"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="m176 272l80 80l80-80M256 48v288"/></svg>';
var rawEllipsisVertical = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><circle cx="256" cy="256" r="48" fill="currentColor"/><circle cx="256" cy="416" r="48" fill="currentColor"/><circle cx="256" cy="96" r="48" fill="currentColor"/></svg>';
var rawExpandOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M432 320v112H320m101.8-10.23L304 304M80 192V80h112M90.2 90.23L208 208M320 80h112v112M421.77 90.2L304 208M192 432H80V320m10.23 101.8L208 304"/></svg>';
var rawFileTrayOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="32" d="M384 80H128c-26 0-43 14-48 40L48 272v112a48.14 48.14 0 0 0 48 48h320a48.14 48.14 0 0 0 48-48V272l-32-152c-5-27-23-40-48-40Z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M48 272h144m128 0h144m-272 0a64 64 0 0 0 128 0"/></svg>';
var rawFolderOpenOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M64 192v-72a40 40 0 0 1 40-40h75.89a40 40 0 0 1 22.19 6.72l27.84 18.56a40 40 0 0 0 22.19 6.72H408a40 40 0 0 1 40 40v40"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M479.9 226.55L463.68 392a40 40 0 0 1-39.93 40H88.25a40 40 0 0 1-39.93-40L32.1 226.55A32 32 0 0 1 64 192h384.1a32 32 0 0 1 31.8 34.55"/></svg>';
var rawInformationCircle = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="currentColor" d="M256 56C145.72 56 56 145.72 56 256s89.72 200 200 200s200-89.72 200-200S366.28 56 256 56m0 82a26 26 0 1 1-26 26a26 26 0 0 1 26-26m48 226h-88a16 16 0 0 1 0-32h28v-88h-16a16 16 0 0 1 0-32h32a16 16 0 0 1 16 16v104h28a16 16 0 0 1 0 32"/></svg>';
var rawMenuOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-miterlimit="10" stroke-width="32" d="M80 160h352M80 256h352M80 352h352"/></svg>';
var rawNotificationsOffOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M128.51 204.59q-.37 6.15-.37 12.76C128.14 304 110 320 84.33 351.43C73.69 364.45 83 384 101.62 384H320m94.5-48.7c-18.48-23.45-30.62-47.05-30.62-118c0-79.3-40.52-107.57-73.88-121.3c-4.43-1.82-8.6-6-9.95-10.55C294.21 65.54 277.82 48 256 48s-38.2 17.55-44 37.47c-1.35 4.6-5.52 8.71-10 10.53a150 150 0 0 0-18 8.79M320 384v16a64 64 0 0 1-128 0v-16"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-miterlimit="10" stroke-width="32" d="M448 448L64 64"/></svg>';
var rawOpenOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M384 224v184a40 40 0 0 1-40 40H104a40 40 0 0 1-40-40V168a40 40 0 0 1 40-40h167.48M336 64h112v112M224 288L440 72"/></svg>';
var rawPlayOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32" d="M112 111v290c0 17.44 17 28.52 31 20.16l247.9-148.37c12.12-7.25 12.12-26.33 0-33.58L143 90.84c-14-8.36-31 2.72-31 20.16Z"/></svg>';
var rawRemove = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M400 256H112"/></svg>';
var rawSearchOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32" d="M221.09 64a157.09 157.09 0 1 0 157.09 157.09A157.1 157.1 0 0 0 221.09 64Z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-miterlimit="10" stroke-width="32" d="M338.29 338.29L448 448"/></svg>';
var rawSend = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="currentColor" d="m476.59 227.05l-.16-.07L49.35 49.84A23.56 23.56 0 0 0 27.14 52A24.65 24.65 0 0 0 16 72.59v113.29a24 24 0 0 0 19.52 23.57l232.93 43.07a4 4 0 0 1 0 7.86L35.53 303.45A24 24 0 0 0 16 327v113.31A23.57 23.57 0 0 0 26.59 460a23.94 23.94 0 0 0 13.22 4a24.55 24.55 0 0 0 9.52-1.93L476.4 285.94l.19-.09a32 32 0 0 0 0-58.8"/></svg>';
var rawSwapVerticalOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M464 208L352 96L240 208m112-94.87V416M48 304l112 112l112-112m-112 94V96"/></svg>';
var rawTrashOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="m112 112l20 320c.95 18.49 14.4 32 32 32h184c17.67 0 30.87-13.51 32-32l20-320"/><path fill="currentColor" stroke="currentColor" stroke-linecap="round" stroke-miterlimit="10" stroke-width="32" d="M80 112h352"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M192 112V72h0a23.93 23.93 0 0 1 24-24h80a23.93 23.93 0 0 1 24 24h0v40m-64 64v224m-72-224l8 224m136-224l-8 224"/></svg>';
var rawTrendingDown = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M352 368h112V256"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="m48 144l121.37 121.37a32 32 0 0 0 45.26 0l50.74-50.74a32 32 0 0 1 45.26 0L448 352"/></svg>';
var rawTrendingUp = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M352 144h112v112"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="m48 368l121.37-121.37a32 32 0 0 1 45.26 0l50.74 50.74a32 32 0 0 0 45.26 0L448 160"/></svg>';
var rawVolumeHighOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M126 192H56a8 8 0 0 0-8 8v112a8 8 0 0 0 8 8h69.65a15.93 15.93 0 0 1 10.14 3.54l91.47 74.89A8 8 0 0 0 240 392V120a8 8 0 0 0-12.74-6.43l-91.47 74.89A15 15 0 0 1 126 192m194 128c9.74-19.38 16-40.84 16-64c0-23.48-6-44.42-16-64m48 176c19.48-33.92 32-64.06 32-112s-12-77.74-32-112m48 272c30-46 48-91.43 48-160s-18-113-48-160"/></svg>';
var rawVolumeLowOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M189.65 192H120a8 8 0 0 0-8 8v112a8 8 0 0 0 8 8h69.65a16 16 0 0 1 10.14 3.63l91.47 75a8 8 0 0 0 12.74-6.46V119.83a8 8 0 0 0-12.74-6.44l-91.47 75a16 16 0 0 1-10.14 3.61M384 320c9.74-19.41 16-40.81 16-64c0-23.51-6-44.4-16-64"/></svg>';
var rawVolumeMuteOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-miterlimit="10" stroke-width="32" d="M416 432L64 80"/><path fill="currentColor" d="M224 136.92v33.8a4 4 0 0 0 1.17 2.82l24 24a4 4 0 0 0 6.83-2.82v-74.15a24.53 24.53 0 0 0-12.67-21.72a23.91 23.91 0 0 0-25.55 1.83a8 8 0 0 0-.66.51l-31.94 26.15a4 4 0 0 0-.29 5.92l17.05 17.06a4 4 0 0 0 5.37.26Zm0 238.16l-78.07-63.92a32 32 0 0 0-20.28-7.16H64v-96h50.72a4 4 0 0 0 2.82-6.83l-24-24a4 4 0 0 0-2.82-1.17H56a24 24 0 0 0-24 24v112a24 24 0 0 0 24 24h69.76l91.36 74.8a8 8 0 0 0 .66.51a23.93 23.93 0 0 0 25.85 1.69A24.49 24.49 0 0 0 256 391.45v-50.17a4 4 0 0 0-1.17-2.82l-24-24a4 4 0 0 0-6.83 2.82ZM352 256c0-24.56-5.81-47.88-17.75-71.27a16 16 0 0 0-28.5 14.54C315.34 218.06 320 236.62 320 256q0 4-.31 8.13a8 8 0 0 0 2.32 6.25l19.66 19.67a4 4 0 0 0 6.75-2A147 147 0 0 0 352 256m64 0c0-51.19-13.08-83.89-34.18-120.06a16 16 0 0 0-27.64 16.12C373.07 184.44 384 211.83 384 256c0 23.83-3.29 42.88-9.37 60.65a8 8 0 0 0 1.9 8.26l16.77 16.76a4 4 0 0 0 6.52-1.27C410.09 315.88 416 289.91 416 256"/><path fill="currentColor" d="M480 256c0-74.26-20.19-121.11-50.51-168.61a16 16 0 1 0-27 17.22C429.82 147.38 448 189.5 448 256c0 47.45-8.9 82.12-23.59 113a4 4 0 0 0 .77 4.55L443 391.39a4 4 0 0 0 6.4-1C470.88 348.22 480 307 480 256"/></svg>';
var rawWarning = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="currentColor" d="M449.07 399.08L278.64 82.58c-12.08-22.44-44.26-22.44-56.35 0L51.87 399.08A32 32 0 0 0 80 446.25h340.89a32 32 0 0 0 28.18-47.17m-198.6-1.83a20 20 0 1 1 20-20a20 20 0 0 1-20 20m21.72-201.15l-5.74 122a16 16 0 0 1-32 0l-5.74-121.95a21.73 21.73 0 0 1 21.5-22.69h.21a21.74 21.74 0 0 1 21.73 22.7Z"/></svg>';
function bake(svg) {
  return `data:image/svg+xml;utf8,${svg}`;
}
var iconAdd = bake(rawAdd);
var iconAlertCircle = bake(rawAlertCircle);
var iconAlertCircleOutline = bake(rawAlertCircleOutline);
var iconAppsOutline = bake(rawAppsOutline);
var iconArchiveOutline = bake(rawArchiveOutline);
var iconArrowRedoOutline = bake(rawArrowRedoOutline);
var iconArrowUndoOutline = bake(rawArrowUndoOutline);
var iconBackspaceOutline = bake(rawBackspaceOutline);
var iconCalendarOutline = bake(rawCalendarOutline);
var iconCheckmarkCircle = bake(rawCheckmarkCircle);
var iconCheckmarkOutline = bake(rawCheckmarkOutline);
var iconChevronBack = bake(rawChevronBack);
var iconChevronBackOutline = bake(rawChevronBackOutline);
var iconChevronDownOutline = bake(rawChevronDownOutline);
var iconChevronForward = bake(rawChevronForward);
var iconChevronForwardOutline = bake(rawChevronForwardOutline);
var iconChevronUpOutline = bake(rawChevronUpOutline);
var iconClose = bake(rawClose);
var iconCloseOutline = bake(rawCloseOutline);
var iconCloudUploadOutline = bake(rawCloudUploadOutline);
var iconCreateOutline = bake(rawCreateOutline);
var iconDocumentAttachOutline = bake(rawDocumentAttachOutline);
var iconContractOutline = bake(rawContractOutline);
var iconDocumentOutline = bake(rawDocumentOutline);
var iconDocumentTextOutline = bake(rawDocumentTextOutline);
var iconDownloadOutline = bake(rawDownloadOutline);
var iconEllipsisVertical = bake(rawEllipsisVertical);
var iconExpandOutline = bake(rawExpandOutline);
var iconFileTrayOutline = bake(rawFileTrayOutline);
var iconFolderOpenOutline = bake(rawFolderOpenOutline);
var iconInformationCircle = bake(rawInformationCircle);
var iconMenuOutline = bake(rawMenuOutline);
var iconNotificationsOffOutline = bake(rawNotificationsOffOutline);
var iconOpenOutline = bake(rawOpenOutline);
var iconPlayOutline = bake(rawPlayOutline);
var iconRemove = bake(rawRemove);
var iconSearchOutline = bake(rawSearchOutline);
var iconSend = bake(rawSend);
var iconSwapVerticalOutline = bake(rawSwapVerticalOutline);
var iconTrashOutline = bake(rawTrashOutline);
var iconTrendingDown = bake(rawTrendingDown);
var iconTrendingUp = bake(rawTrendingUp);
var iconVolumeHighOutline = bake(rawVolumeHighOutline);
var iconVolumeLowOutline = bake(rawVolumeLowOutline);
var iconVolumeMuteOutline = bake(rawVolumeMuteOutline);
var iconWarning = bake(rawWarning);
var BY_NAME = {
  "add": iconAdd,
  "alert-circle": iconAlertCircle,
  "alert-circle-outline": iconAlertCircleOutline,
  "apps-outline": iconAppsOutline,
  "archive-outline": iconArchiveOutline,
  "arrow-redo-outline": iconArrowRedoOutline,
  "arrow-undo-outline": iconArrowUndoOutline,
  "backspace-outline": iconBackspaceOutline,
  "calendar-outline": iconCalendarOutline,
  "checkmark-circle": iconCheckmarkCircle,
  "checkmark-outline": iconCheckmarkOutline,
  "chevron-back": iconChevronBack,
  "chevron-back-outline": iconChevronBackOutline,
  "chevron-down-outline": iconChevronDownOutline,
  "chevron-forward": iconChevronForward,
  "chevron-forward-outline": iconChevronForwardOutline,
  "chevron-up-outline": iconChevronUpOutline,
  "close": iconClose,
  "close-outline": iconCloseOutline,
  "cloud-upload-outline": iconCloudUploadOutline,
  "create-outline": iconCreateOutline,
  "document-attach-outline": iconDocumentAttachOutline,
  "contract-outline": iconContractOutline,
  "document-outline": iconDocumentOutline,
  "document-text-outline": iconDocumentTextOutline,
  "download-outline": iconDownloadOutline,
  "ellipsis-vertical": iconEllipsisVertical,
  "expand-outline": iconExpandOutline,
  "file-tray-outline": iconFileTrayOutline,
  "folder-open-outline": iconFolderOpenOutline,
  "information-circle": iconInformationCircle,
  "menu-outline": iconMenuOutline,
  "notifications-off-outline": iconNotificationsOffOutline,
  "open-outline": iconOpenOutline,
  "play-outline": iconPlayOutline,
  "remove": iconRemove,
  "search-outline": iconSearchOutline,
  "send": iconSend,
  "swap-vertical-outline": iconSwapVerticalOutline,
  "trash-outline": iconTrashOutline,
  "trending-down": iconTrendingDown,
  "trending-up": iconTrendingUp,
  "volume-high-outline": iconVolumeHighOutline,
  "volume-low-outline": iconVolumeLowOutline,
  "volume-mute-outline": iconVolumeMuteOutline,
  "warning": iconWarning
};
function okIcon(value) {
  if (!value) return void 0;
  const trimmed = value.trimStart();
  if (trimmed.startsWith("<svg")) return bake(trimmed);
  return BY_NAME[value] ?? value;
}

// @erplora/outfitkit/dist/ok-inline-feedback.js
var __defProp2 = Object.defineProperty;
var __decorateClass2 = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i7 = decorators.length - 1, decorator; i7 >= 0; i7--)
    if (decorator = decorators[i7])
      result = decorator(target, key, result) || result;
  if (result) __defProp2(target, key, result);
  return result;
};
var DEFAULT_LABELS = {
  dismiss: "Dismiss"
};
var OkInlineFeedback = class extends i3 {
  constructor() {
    super(...arguments);
    this.tone = "info";
    this.dismissible = false;
    this.hidden = false;
    this.labels = {};
    this.hasActions = false;
    this.onActionsSlotChange = (e6) => {
      const slot = e6.target;
      this.hasActions = slot.assignedNodes({ flatten: true }).length > 0;
    };
  }
  static {
    this.styles = i`
    :host {
      /* Vars overridable (estilo Ionic), default = cadena --ok-* → --ion-* → hex.
         --tone-color y --tone-icon se reasignan por tone abajo. */
      --tone-color: var(--ok-primary, var(--ion-color-primary, #3880ff));
      --background-opacity: 0.1;
      --color: var(--ok-text, var(--ion-text-color, #1c1b17));
      --border-radius: var(--ok-radius, var(--ion-border-radius, 8px));
      --padding: var(--ok-spacing, var(--ion-padding, 16px));
      --accent-width: 4px;
      --font: var(--ok-font, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif);

      /* Responsive: el banner ocupa el ancho del contenedor. */
      display: block;
      width: 100%;
      font-family: var(--font);
      box-sizing: border-box;
    }
    :host([hidden]) { display: none; }

    /* Mapa de tonos → color Ionic + icono por defecto. */
    :host([tone='success']) { --tone-color: var(--ok-success, var(--ion-color-success, #2dd55b)); }
    :host([tone='warning']) { --tone-color: var(--ok-warning, var(--ion-color-warning, #ffc409)); }
    :host([tone='danger'])  { --tone-color: var(--ok-danger, var(--ion-color-danger, #c5000f)); }
    :host([tone='neutral']) { --tone-color: var(--ok-medium, var(--ion-color-medium, #5f5f5f)); }
    /* info / sin tono → primary (default ya aplicado en :host). */

    .box {
      position: relative;
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: var(--padding);
      border-radius: var(--border-radius);
      border-inline-start: var(--accent-width) solid var(--tone-color);
      /* Fondo tonal: el color del tono con baja opacidad (color-mix con fallback al borde fino). */
      background: color-mix(in srgb, var(--tone-color) calc(var(--background-opacity) * 100%), transparent);
      color: var(--color);
    }

    .icon {
      flex: 0 0 auto;
      font-size: 1.4rem;
      line-height: 1;
      color: var(--tone-color);
      margin-top: 0.05rem;
    }

    .content {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .row {
      display: flex;
      align-items: flex-start;
      gap: 1rem;
    }
    .text {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }
    .heading {
      font-weight: 700;
      font-size: 0.98rem;
      line-height: 1.3;
    }
    .body {
      font-size: 0.92rem;
      line-height: 1.45;
    }
    .actions {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    /* Si no hay actions, el slot queda vacío y no ocupa espacio. */
    .actions.empty { display: none; }

    .close {
      flex: 0 0 auto;
      background: none;
      border: 0;
      cursor: pointer;
      padding: 0.15rem;
      margin: -0.15rem -0.15rem 0 0;
      color: inherit;
      opacity: 0.6;
      font-size: 1.2rem;
      line-height: 1;
      border-radius: 4px;
      transition: background-color var(--ok-transition, 150ms ease), color var(--ok-transition, 150ms ease),
        border-color var(--ok-transition, 150ms ease), box-shadow var(--ok-transition, 150ms ease),
        opacity 0.15s ease, transform 120ms ease;
    }
    @media (hover: hover) {
      .close:hover { opacity: 1; background: rgba(var(--ion-text-color-rgb, 24, 24, 27), 0.07); }
    }
    .close:active { transform: scale(var(--ok-press-scale, 0.97)); }

    /* Móvil: las actions bajan bajo el texto (apiladas a ancho completo). */
    @media (max-width: 640px) {
      .row { flex-direction: column; align-items: stretch; }
      .actions { width: 100%; }
    }
    @media (prefers-reduced-motion: reduce) {
      .close:hover,
      .close:active { transform: none; }
    }
  `;
  }
  // Textos efectivos: defaults en inglés + overrides del consumidor.
  get t() {
    return { ...DEFAULT_LABELS, ...this.labels };
  }
  // Icono por defecto según el tono (overridable por la prop `icon`).
  defaultIcon() {
    switch (this.tone) {
      case "success":
        return iconCheckmarkCircle;
      case "warning":
        return iconWarning;
      case "danger":
        return iconAlertCircle;
      case "neutral":
        return iconInformationCircle;
      case "info":
      default:
        return iconInformationCircle;
    }
  }
  // Oculta el banner y avisa al consumidor; éste puede revertir restaurando `hidden=false`.
  dismiss() {
    this.hidden = true;
    this.dispatchEvent(new CustomEvent("ok-dismiss", { bubbles: true, composed: true }));
  }
  render() {
    const iconName = this.icon ?? this.defaultIcon();
    return b2`
      <div class="box" role="status">
        <ion-icon class="icon" .icon=${okIcon(iconName)} aria-hidden="true"></ion-icon>
        <div class="content">
          <div class="row">
            <div class="text">
              ${this.heading ? b2`<div class="heading">${this.heading}</div>` : null}
              <div class="body"><slot></slot></div>
            </div>
            <div class="actions ${this.hasActions ? "" : "empty"}">
              <slot name="actions" @slotchange=${this.onActionsSlotChange}></slot>
            </div>
          </div>
        </div>
        ${this.dismissible ? b2`
              <button class="close" aria-label=${this.t.dismiss} @click=${this.dismiss}>
                <ion-icon .icon=${iconClose} aria-hidden="true"></ion-icon>
              </button>
            ` : null}
      </div>
    `;
  }
};
__decorateClass2([
  n4({ type: String, reflect: true })
], OkInlineFeedback.prototype, "tone");
__decorateClass2([
  n4({ type: String })
], OkInlineFeedback.prototype, "heading");
__decorateClass2([
  n4({ type: String })
], OkInlineFeedback.prototype, "icon");
__decorateClass2([
  n4({ type: Boolean, reflect: true })
], OkInlineFeedback.prototype, "dismissible");
__decorateClass2([
  n4({ type: Boolean, reflect: true })
], OkInlineFeedback.prototype, "hidden");
__decorateClass2([
  n4({ attribute: false })
], OkInlineFeedback.prototype, "labels");
__decorateClass2([
  r5()
], OkInlineFeedback.prototype, "hasActions");
define("ok-inline-feedback", OkInlineFeedback);

// lit-html/directive-helpers.js
var { I: t4 } = j;
var i5 = (o7) => o7;
var s4 = () => document.createComment("");
var v2 = (o7, n6, e6) => {
  const l3 = o7._$AA.parentNode, d3 = void 0 === n6 ? o7._$AB : n6._$AA;
  if (void 0 === e6) {
    const i7 = l3.insertBefore(s4(), d3), n7 = l3.insertBefore(s4(), d3);
    e6 = new t4(i7, n7, o7, o7.options);
  } else {
    const t5 = e6._$AB.nextSibling, n7 = e6._$AM, c5 = n7 !== o7;
    if (c5) {
      let t6;
      e6._$AQ?.(o7), e6._$AM = o7, void 0 !== e6._$AP && (t6 = o7._$AU) !== n7._$AU && e6._$AP(t6);
    }
    if (t5 !== d3 || c5) {
      let o8 = e6._$AA;
      for (; o8 !== t5; ) {
        const t6 = i5(o8).nextSibling;
        i5(l3).insertBefore(o8, d3), o8 = t6;
      }
    }
  }
  return e6;
};
var u3 = (o7, t5, i7 = o7) => (o7._$AI(t5, i7), o7);
var m3 = {};
var p3 = (o7, t5 = m3) => o7._$AH = t5;
var M2 = (o7) => o7._$AH;
var h3 = (o7) => {
  o7._$AR(), o7._$AA.remove();
};

// lit-html/directives/repeat.js
var u4 = (e6, s5, t5) => {
  const r6 = /* @__PURE__ */ new Map();
  for (let l3 = s5; l3 <= t5; l3++) r6.set(e6[l3], l3);
  return r6;
};
var c4 = e4(class extends i4 {
  constructor(e6) {
    if (super(e6), e6.type !== t3.CHILD) throw Error("repeat() can only be used in text expressions");
  }
  dt(e6, s5, t5) {
    let r6;
    void 0 === t5 ? t5 = s5 : void 0 !== s5 && (r6 = s5);
    const l3 = [], o7 = [];
    let i7 = 0;
    for (const s6 of e6) l3[i7] = r6 ? r6(s6, i7) : i7, o7[i7] = t5(s6, i7), i7++;
    return { values: o7, keys: l3 };
  }
  render(e6, s5, t5) {
    return this.dt(e6, s5, t5).values;
  }
  update(s5, [t5, r6, c5]) {
    const d3 = M2(s5), { values: p4, keys: a3 } = this.dt(t5, r6, c5);
    if (!Array.isArray(d3)) return this.ut = a3, p4;
    const h4 = this.ut ??= [], v3 = [];
    let m4, y3, x2 = 0, j2 = d3.length - 1, k2 = 0, w2 = p4.length - 1;
    for (; x2 <= j2 && k2 <= w2; ) if (null === d3[x2]) x2++;
    else if (null === d3[j2]) j2--;
    else if (h4[x2] === a3[k2]) v3[k2] = u3(d3[x2], p4[k2]), x2++, k2++;
    else if (h4[j2] === a3[w2]) v3[w2] = u3(d3[j2], p4[w2]), j2--, w2--;
    else if (h4[x2] === a3[w2]) v3[w2] = u3(d3[x2], p4[w2]), v2(s5, v3[w2 + 1], d3[x2]), x2++, w2--;
    else if (h4[j2] === a3[k2]) v3[k2] = u3(d3[j2], p4[k2]), v2(s5, d3[x2], d3[j2]), j2--, k2++;
    else if (void 0 === m4 && (m4 = u4(a3, k2, w2), y3 = u4(h4, x2, j2)), m4.has(h4[x2])) if (m4.has(h4[j2])) {
      const e6 = y3.get(a3[k2]), t6 = void 0 !== e6 ? d3[e6] : null;
      if (null === t6) {
        const e7 = v2(s5, d3[x2]);
        u3(e7, p4[k2]), v3[k2] = e7;
      } else v3[k2] = u3(t6, p4[k2]), v2(s5, d3[x2], t6), d3[e6] = null;
      k2++;
    } else h3(d3[j2]), j2--;
    else h3(d3[x2]), x2++;
    for (; k2 <= w2; ) {
      const e6 = v2(s5, v3[w2 + 1]);
      u3(e6, p4[k2]), v3[k2++] = e6;
    }
    for (; x2 <= j2; ) {
      const e6 = d3[x2++];
      null !== e6 && h3(e6);
    }
    return this.ut = a3, p3(s5, v3), E;
  }
});

// lit-html/directives/style-map.js
var n5 = "important";
var i6 = " !" + n5;
var o6 = e4(class extends i4 {
  constructor(t5) {
    if (super(t5), t5.type !== t3.ATTRIBUTE || "style" !== t5.name || t5.strings?.length > 2) throw Error("The `styleMap` directive must be used in the `style` attribute and must be the only part in the attribute.");
  }
  render(t5) {
    return Object.keys(t5).reduce((e6, r6) => {
      const s5 = t5[r6];
      return null == s5 ? e6 : e6 + `${r6 = r6.includes("-") ? r6 : r6.replace(/(?:^(webkit|moz|ms|o)|)(?=[A-Z])/g, "-$&").toLowerCase()}:${s5};`;
    }, "");
  }
  update(e6, [r6]) {
    const { style: s5 } = e6.element;
    if (void 0 === this.ft) return this.ft = new Set(Object.keys(r6)), this.render(r6);
    for (const t5 of this.ft) null == r6[t5] && (this.ft.delete(t5), t5.includes("-") ? s5.removeProperty(t5) : s5[t5] = null);
    for (const t5 in r6) {
      const e7 = r6[t5];
      if (null != e7) {
        this.ft.add(t5);
        const r7 = "string" == typeof e7 && e7.endsWith(i6);
        t5.includes("-") || r7 ? s5.setProperty(t5, r7 ? e7.slice(0, -11) : e7, r7 ? n5 : "") : s5[t5] = e7;
      }
    }
    return E;
  }
});

// @erplora/outfitkit/dist/shared/anchor.js
function shadowAnchorEvent(ev) {
  const el = ev.currentTarget ?? ev.target;
  return new CustomEvent("ok-popover-anchor", { detail: { ionShadowTarget: el } });
}

// @erplora/outfitkit/dist/shared/ion-tone.js
var DEFAULT_HEX = {
  primary: "#0054e9",
  secondary: "#0163aa",
  tertiary: "#6030ff",
  success: "#2dd55b",
  warning: "#ffc409",
  danger: "#c5000f",
  light: "#f4f5f8",
  medium: "#636469",
  dark: "#222428"
};
var DEFAULT_CONTRAST = {
  primary: "#fff",
  secondary: "#fff",
  tertiary: "#fff",
  success: "#000",
  warning: "#000",
  danger: "#fff",
  light: "#000",
  medium: "#fff",
  dark: "#fff"
};
var TONE_NAME = /^[a-z][a-z0-9-]*$/;
function tokenChain(okName, ionName, hex) {
  return `var(--ok-${okName}, var(--ion-color-${ionName}${hex ? `, ${hex}` : ""}))`;
}
function ionTone(tone, variant) {
  if (!tone || !TONE_NAME.test(tone)) return void 0;
  const value = tokenChain(tone, tone, DEFAULT_HEX[tone]);
  switch (variant) {
    case "text":
      return `color: ${value};`;
    case "clear":
      return `--color: ${value};`;
    case "outline":
      return `--color: ${value}; --border-color: ${value}; --background-activated: ${value}; --background-focused: ${value};`;
    case "solid": {
      const contrast = tokenChain(`${tone}-contrast`, `${tone}-contrast`, DEFAULT_CONTRAST[tone]);
      return `--background: ${value}; --color: ${contrast}; --background-hover: var(--ion-color-${tone}-tint, ${value}); --background-activated: var(--ion-color-${tone}-shade, ${value}); --background-focused: var(--ion-color-${tone}-shade, ${value});`;
    }
  }
}

// @erplora/outfitkit/dist/shared/searchbar-single-clear.js
function syncSearchbarInputName(root, name) {
  const bar = root?.querySelector("ion-searchbar");
  if (!bar) return;
  void customElements.whenDefined("ion-searchbar").then(() => bar.getInputElement?.()).then((input) => {
    const n6 = name();
    if (input && input.getAttribute("aria-label") !== n6) {
      input.setAttribute("aria-label", n6);
    }
  }).catch(() => {
  });
}
var searchbarSingleClear = i`
  ion-searchbar input::-webkit-search-cancel-button {
    -webkit-appearance: none;
    appearance: none;
    display: none;
  }
`;

// @erplora/outfitkit/dist/ok-data-table.js
var CSV_BOM = "\uFEFF";
var WINDOWS_1252_C1 = [
  8364,
  129,
  8218,
  402,
  8222,
  8230,
  8224,
  8225,
  710,
  8240,
  352,
  8249,
  338,
  141,
  381,
  143,
  144,
  8216,
  8217,
  8220,
  8221,
  8226,
  8211,
  8212,
  732,
  8482,
  353,
  8250,
  339,
  157,
  382,
  376
];
function decodeWindows1252(bytes) {
  let text = "";
  for (const byte of bytes) {
    text += String.fromCharCode(byte >= 128 && byte <= 159 ? WINDOWS_1252_C1[byte - 128] : byte);
  }
  return text;
}
function decodeCsvBuffer(buf) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    text = decodeWindows1252(new Uint8Array(buf));
  }
  return text.charCodeAt(0) === 65279 ? text.slice(1) : text;
}
var __defProp3 = Object.defineProperty;
var __decorateClass3 = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i7 = decorators.length - 1, decorator; i7 >= 0; i7--)
    if (decorator = decorators[i7])
      result = decorator(target, key, result) || result;
  if (result) __defProp3(target, key, result);
  return result;
};
function decideRowActionsFit(input) {
  const { containerWidth, contentWidth, collapsed, decidedAtWidth } = input;
  if (!(containerWidth > 0)) return { collapsed, decidedAtWidth };
  if (containerWidth !== decidedAtWidth) {
    if (collapsed) return { collapsed: false, decidedAtWidth: containerWidth };
    return { collapsed: contentWidth > containerWidth, decidedAtWidth: containerWidth };
  }
  if (!collapsed && contentWidth > containerWidth) return { collapsed: true, decidedAtWidth };
  return { collapsed, decidedAtWidth };
}
var DEFAULT_LABELS2 = {
  search: "Search\u2026",
  empty: "No results",
  filters: "Filters",
  clear: "Clear",
  apply: "Apply",
  showResults: "Show results",
  selected: "{n} selected",
  importCsv: "Import CSV",
  exportCsv: "Export CSV",
  add: "Add",
  moreActions: "More actions",
  rowsPerPage: "Rows per page",
  perPageShort: "{n} / page",
  viewList: "View as list",
  viewCards: "View as cards",
  columnsVisible: "Visible columns",
  columns: "Columns",
  actions: "Actions",
  close: "Close",
  newRecord: "New",
  editRecord: "Edit",
  form: "Form",
  filterPlaceholder: "Filter\u2026",
  from: "From",
  to: "To",
  fromOf: "{label} from",
  toOf: "{label} to",
  gte: "\u2265",
  lte: "\u2264",
  noValues: "No values",
  selectAll: "Select all",
  selectRow: "Select row",
  select: "Select",
  showing: "Showing {from}\u2013{to} of",
  recordSingular: "record",
  recordPlural: "records",
  loadMore: "Load more",
  noMatches: "No results match your search or filters",
  showAll: "Show all",
  loadError: "Couldn't load the data",
  retry: "Retry"
};
var ES_LABELS = {
  search: "Buscar\u2026",
  empty: "Sin resultados",
  filters: "Filtros",
  clear: "Limpiar",
  apply: "Aplicar",
  showResults: "Ver resultados",
  selected: "{n} seleccionados",
  importCsv: "Importar CSV",
  exportCsv: "Exportar CSV",
  add: "A\xF1adir",
  moreActions: "M\xE1s acciones",
  rowsPerPage: "Filas por p\xE1gina",
  perPageShort: "{n} / p\xE1g.",
  viewList: "Vista lista",
  viewCards: "Vista tarjetas",
  columnsVisible: "Columnas visibles",
  columns: "Columnas",
  actions: "Acciones",
  close: "Cerrar",
  newRecord: "Nuevo",
  editRecord: "Editar",
  form: "Formulario",
  filterPlaceholder: "Filtrar\u2026",
  from: "Desde",
  to: "Hasta",
  fromOf: "{label} desde",
  toOf: "{label} hasta",
  gte: "\u2265",
  lte: "\u2264",
  noValues: "Sin valores",
  selectAll: "Seleccionar todo",
  selectRow: "Seleccionar fila",
  select: "Seleccionar",
  showing: "Mostrando {from}\u2013{to} de",
  recordSingular: "registro",
  recordPlural: "registros",
  loadMore: "Cargar m\xE1s",
  noMatches: "Ning\xFAn resultado coincide con la b\xFAsqueda o los filtros",
  showAll: "Mostrar todo",
  loadError: "No se han podido cargar los datos",
  retry: "Reintentar"
};
var NUMERIC_TEXT = /^-?\d+(\.\d+)?$/;
var ISO_DATE_OR_TIME = /^(\d{4}-\d{2}-\d{2}|\d{2}:\d{2})/;
var _OkDataTable = class _OkDataTable2 extends i3 {
  constructor() {
    super(...arguments);
    this.columns = [];
    this.rows = [];
    this.searchKeys = [];
    this.rowKeyField = "id";
    this.pageSize = 10;
    this.labels = {};
    this.actions = [];
    this.addable = false;
    this.pageSizeOptions = [10, 25, 50, 100];
    this.fill = false;
    this.columnPicker = true;
    this.csv = false;
    this.csvName = "export.csv";
    this.serverSide = false;
    this.total = 0;
    this.page = 0;
    this.searchable = false;
    this.sortDir = "asc";
    this.filterValues = {};
    this.title = "";
    this.views = false;
    this.exportable = false;
    this.importable = false;
    this.columnSelector = false;
    this.rowClickable = false;
    this.selectable = false;
    this.inlineFilters = false;
    this.menuActions = [];
    this.q = "";
    this.clientPage = 0;
    this.clientPageSize = 0;
    this.mobileShown = 0;
    this.clientSort = "";
    this.clientSortDir = "asc";
    this.clientFilters = {};
    this.filterDraft = {};
    this.serverFilters = {};
    this.panel = "none";
    this.panelTitle = "";
    this.viewMode = "table";
    this.viewChosenByUser = false;
    this.isMobile = false;
    this.xOverflow = false;
    this.actionsTrackPx = 0;
    this.rowActionsCollapsed = false;
    this.actionsLabelFits = true;
    this.unfoldedCells = /* @__PURE__ */ new Set();
    this.lastPointerType = "";
    this.fitDecidedAtWidth = -1;
    this.rowMenuOpen = false;
    this.columnChoice = /* @__PURE__ */ new Map();
    this.internalSelection = /* @__PURE__ */ new Set();
    this.menuOpen = false;
    this.onLocaleChanged = () => this.requestUpdate();
    this.onKeydown = (e6) => {
      if (e6.key !== "Escape" || e6.defaultPrevented || this.panel === "none") return;
      e6.preventDefault();
      e6.stopPropagation();
      this.closePanel("escape");
    };
    this.onWindowResize = () => {
      this.measureXOverflow();
      this.measureRowActionsFit();
      this.syncSheetInsets();
      this.syncContentAfter();
    };
    this.sheetContent = null;
    this.notePointer = (e6) => {
      this.lastPointerType = e6.pointerType;
    };
    this.onSearch = (ev) => {
      const value = ev.target.value ?? "";
      if (this.serverSide) {
        this.q = value;
        this.emit("searchChange", value);
      } else {
        this.q = value;
        this.clientPage = 0;
        this.mobileShown = 0;
      }
    };
    this.gapLabels = /* @__PURE__ */ new Map();
    this.slotActionsCache = null;
  }
  static {
    this.styles = i`
    ${searchbarSingleClear}
    :host {
      /* Vars overridable (estilo Ionic), default = cadena --ok-* → --ion-* → hex */
      --background: var(--ok-surface, var(--ion-card-background, var(--ion-background-color, #ffffff)));
      --color: var(--ok-text, var(--ion-text-color, #1c1b17));
      --color-muted: var(--ok-muted, var(--ion-color-medium, rgba(var(--ion-text-color-rgb, 24, 24, 27), 0.55)));
      --border-color: var(--ok-border, var(--ion-color-step-150, rgba(var(--ion-text-color-rgb, 24, 24, 27), 0.12)));
      --border-color-soft: var(--ok-border-soft, var(--ion-color-step-100, rgba(var(--ion-text-color-rgb, 24, 24, 27), 0.07)));
      /* Borde más marcado para los controles de la toolbar (selects/pastilla de fechas), para que se
       * distingan como controles en claro y oscuro aunque el lienzo y la superficie casi no contrasten. */
      --control-border: color-mix(in srgb, var(--color) 22%, transparent);
      /* Relieve de cabecera/pie: step-100 (definido en claro y oscuro) → contraste con el lienzo. */
      --header-background: var(--ok-surface-2, var(--ion-color-step-100, rgba(var(--ion-text-color-rgb, 24, 24, 27), 0.04)));
      --row-hover: var(--ok-row-hover, var(--ion-color-step-50, rgba(var(--ion-text-color-rgb, 24, 24, 27), 0.03)));
      --primary: var(--ok-primary, var(--ion-color-primary, #3880ff));
      --primary-contrast: var(--ok-primary-contrast, var(--ion-color-primary-contrast, #ffffff));
      --border-radius: var(--ok-radius, 16px);
      --font: var(--ok-font, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif);

      display: block;
      color: var(--color);
      font-family: var(--font);
    }
    * { box-sizing: border-box; }
    .card {
      position: relative;
      display: flex;
      flex-direction: column;
      /* Flat: sin borde ni elevación (directiva 2026-06-09). */
      border: 0;
      border-radius: var(--border-radius);
      overflow: hidden;
      background: var(--background);
      box-shadow: none;
    }

    /* Panel lateral derecho (drawer) DENTRO de la tabla: filtros / alta-edición. Base (sin media):
       overlay absoluto — es lo que había hasta #75 y lo que ve un navegador sin media queries. */
    .tk-scrim { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.18); z-index: 19; }
    .drawer { position: absolute; top: 0; right: 0; height: 100%; width: 340px; max-width: 88%;
      background: var(--background); border-left: 1px solid var(--border-color);
      display: flex; flex-direction: column; z-index: 20;
      animation: tk-slide-in 0.18s ease; }
    @keyframes tk-slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
    /* #75 — El panel EMPUJA en escritorio y es HOJA COMPLETA en móvil; nunca tapa a medias.
       Medido en el hub (Servicios/Citas): a 1440 el overlay de 340px se pintaba ENCIMA de
       «Duración», «Acciones» y el selector de columnas, con el 90% de la tabla vacío a la
       izquierda; a 390 dejaba una tira de 45px de tabla (media lupa, medio «Co…») que hacía
       parecer el formulario un pop-up mal puesto. Square Dashboard reduce la tabla con un panel
       fijo; Fresha/Shopify/Odoo abren una hoja a pantalla completa en móvil.
       ≥ 834px: mientras hay panel, .card pasa a rejilla de DOS columnas (tabla | panel 360px):
       la tabla se estrecha (ya sabe hacer scroll-x, #67) y nada queda tapado. */
    @media (min-width: 834px) {
      .card.has-panel { display: grid; grid-template-columns: minmax(0, 1fr) 360px; grid-template-rows: auto minmax(0, 1fr) auto; }
      .card.has-panel > .bar { grid-column: 1; grid-row: 1; }
      .card.has-panel > .scroll, .card.has-panel > .cards-grid, .card.has-panel > .empty, .card.has-panel > .load-error { grid-column: 1; grid-row: 2; min-height: 0; overflow: auto; }
      .card.has-panel > .pager { grid-column: 1; grid-row: 3; }
      .card.has-panel > .drawer { position: static; grid-column: 2; grid-row: 1 / -1; width: auto; max-width: none; height: auto; min-height: 0; animation: none; }
      .card.has-panel > .tk-scrim { display: none; }
    }
    /* < 834px: hoja a pantalla completa con su cabecera (título + Cerrar); sin tira residual.
       position:fixed dentro de ion-content se ancla al área de contenido (contain), que es justo el hueco
       bajo la cabecera de la app: el usuario conserva el título de la página. */
    @media (max-width: 833.98px) {
      .drawer { position: fixed; inset: 0; top: var(--ok-sheet-top, 0px); bottom: var(--ok-sheet-bottom, 0px); width: 100%; max-width: none; height: auto; border-left: 0; z-index: 1000; }
      .tk-scrim { display: none; }
    }
    .drawer .dh { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between;
      padding: 0.6rem 0.5rem 0.6rem 1rem; border-bottom: 1px solid var(--border-color); font-size: 1rem; }
    .drawer .db { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 1rem; display: flex; flex-direction: column; gap: 0.85rem; }
    .fblock { display: flex; flex-direction: column; gap: 0.45rem; }
    .flabel { font-size: 13px; font-weight: 500; color: var(--color); }
    .frange { display: flex; gap: 0.5rem; }
    /* Filtros cliente: multi-select con ion-select (ventana flotante de Ionic) + rango de fechas. */
    .daterange { display: flex; gap: 0.6rem; }
    .daterange ion-input { flex: 1; }
    /* Pie del drawer de filtros: Limpiar / Aplicar. */
    .df { flex: 0 0 auto; display: flex; align-items: center; justify-content: flex-end; gap: 0.4rem; padding: 0.6rem 0.85rem; border-top: 1px solid var(--border-color); }
    .df .df-clear { margin-right: auto; }
    /* #207 — Server-mode «Show results»: the one button of the footer, as wide as the sheet. */
    .df .df-done { flex: 1 1 auto; }

    /* Modo fill: la tabla ocupa el alto del contenedor; filas con scroll interno; pager fijo. */
    :host([fill]) { display: flex; flex-direction: column; height: 100%; min-height: 0; }
    :host([fill]) .card { flex: 1 1 auto; min-height: 0; }
    :host([fill]) .bar, :host([fill]) .panel, :host([fill]) .pager { flex: 0 0 auto; }
    :host([fill]) .scroll, :host([fill]) .cards-grid { flex: 1 1 auto; min-height: 0; overflow: auto; }
    /* Sin filas, renderTable/renderCards devuelven SOLO el bloque .empty (sin .scroll). En modo
       fill hay que estirarlo para que ocupe el hueco entre toolbar y pager y centre su contenido
       (icono + mensaje) en vertical; si no, queda pegado arriba con el pager a media altura. */
    :host([fill]) .empty, :host([fill]) .load-error { flex: 1 1 auto; min-height: 0; }
    /* #218 — On a phone (MOBILE_BREAKPOINT, where the table turns into cards and «Load more») the
       module paints other blocks above the table, and rows boxed in between toolbar and footer got
       what was left: a 315px card in a 32-155px window, never readable whole. Phone lists scroll
       WITH the page (Shopify, Square, Odoo): the card is as tall as its content, the rows are not a
       scroller of their own and the shell's ion-content scrolls.
       The host box stays as it was, so the blocks ABOVE keep their size (growing it squeezed an
       ion-segment or ion-card to 0px), and the cards run past it into the page scroll. Only when
       something in flow comes AFTER the table ([content-after], see syncContentAfter) does the box
       grow, pushing that content down instead of painting over it. !important because every
       module ships .page > ok-data-table { flex: 1 1 auto; min-height: 0 }, and only an important
       declaration from inside the shadow wins over the page's own rule. */
    @media (max-width: 640px) {
      :host([fill]) .card { flex: 1 0 auto; }
      :host([fill]) .scroll, :host([fill]) .cards-grid { flex: 0 0 auto; }
      :host([fill]) .cards-grid { overflow: visible; }
      :host([fill][content-after]) { height: auto; flex-shrink: 0 !important; }
    }

    /* ── Topbar / cabecera (relieve) ─────────────────────────────────────────────────────── */
    .bar { display: flex; flex-direction: column; gap: 0.6rem; padding: 0.65rem 1rem; border-bottom: 1px solid var(--border-color); background: var(--header-background); }
    /* Toolbar CONSOLIDADA: TODOS los controles son hijos directos de UNA sola fila flex que
     * envuelve ELEMENTO A ELEMENTO (no por bloques): caben en una línea → una línea; los que no
     * caben bajan a la(s) línea(s) que hagan falta. El cluster derecho se empuja al borde con
     * .tk-spacer (hueco flexible) solo cuando todo cabe en una línea; al envolver, el spacer se
     * oculta y todo se apila a la izquierda.
     * ORDEN CANÓNICO (2026-06-22, izquierda→derecha): [buscador] · [filtros en línea] · ‹spacer› ·
     * [SELECTORES: columnas → filas/página] · [BOTONES: vistas → filtros(funnel) → import → export →
     * alta → ⋮ → acción primaria]. Es decir: buscador al inicio, filtros en medio, y al final los
     * selectores (columnas, luego «N por página») seguidos de los botones de acción. */
    .bar-main { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
    .bar-main > ion-button { --padding-start: 0.5rem; --padding-end: 0.5rem; margin: 0; }
    /* Spacer que absorbe el hueco libre en pantallas anchas (empuja el cluster derecho al borde).
     * Se oculta por debajo de 1024px para que, al envolver, los controles se apilen a la izquierda. */
    .tk-spacer { flex: 1 1 0; min-width: 0; align-self: stretch; }
    @media (max-width: 1024px) { .tk-spacer { display: none; } }
    /* Buscador a ancho completo (línea propia) en móvil; el resto envuelve debajo. */
    @media (max-width: 640px) { .search { flex-basis: 100%; max-width: none; } }
    .title-wrap { display: flex; align-items: baseline; gap: 0.5rem; }
    .title { font-size: 15px; font-weight: 600; line-height: 1; margin: 0; }
    .title-count { font-size: 12px; font-weight: 500; color: var(--color-muted); }

    /* Botón de herramienta cuadrado (filtros/import/export), look del Hub: 36×36, badge contador. */
    .toolbtn { position: relative; --padding-start: 0; --padding-end: 0; --border-radius: 10px; width: 36px; height: 36px; margin: 0; }
    .toolbtn .badge { position: absolute; top: -5px; right: -5px; min-width: 16px; height: 16px; padding: 0 3px; border-radius: 999px; background: var(--primary); color: var(--primary-contrast); font-size: 10px; font-weight: 700; line-height: 16px; text-align: center; pointer-events: none; }

    /* Buscador (caja con icono + limpiar), look del Hub. No crece (el spacer se queda el hueco);
     * puede encoger hasta min-width y, por debajo, envuelve. */
    .search { flex: 0 1 22rem; min-width: 12rem; max-width: 24rem; }
    ion-searchbar { --background: var(--background); --border-radius: 10px; padding: 0; min-height: 36px; }
    /* Flat: el buscador quita borde y elevación vía la clase específica de Ionic 'ion-no-border'.
     * (La regla global de Ionic para .ion-no-border no cruza el Shadow DOM, así que la
     * reimplementamos aquí dentro: --box-shadow controla la elevación; ::part(native) el borde.) */
    ion-searchbar.ion-no-border { --box-shadow: none; }
    ion-searchbar.ion-no-border::part(native) { border: none; box-shadow: none; }

    /* Toggle de vista lista/tarjetas (segmento) */
    .viewseg { display: inline-flex; align-items: center; gap: 2px; padding: 2px; border: 1px solid var(--border-color); border-radius: 10px; background: var(--background); }
    .viewseg ion-button { --border-radius: 7px; }

    /* Botón primario (primaryAction) */
    .primary-btn { --background: var(--primary); --color: var(--primary-contrast); }
    /* #76 — El alta en MÓVIL: botón primario CON etiqueta y área táctil de 44px, en vez del «+»
       icónico de 36px al final de la barra. Fresha/Square/Shopify POS ponen la acción primaria
       de la lista como botón visible con texto (o FAB), nunca como icono anónimo.
       #113 — Y en ESCRITORIO igual: Odoo («New»), Business Central, Shopify («Add product»),
       WooCommerce, Lightspeed y Fresha rotulan y rellenan la acción principal de un listado; NN/g
       reserva el botón sin rótulo para lo universal (buscar, cerrar). Aquí solo cambia la ALTURA:
       36px para alinear con .toolbtn y el buscador, y los 44px táctiles vuelven abajo con el
       resto de objetivos de puntero grueso. */
    .add-btn { min-height: 36px; --border-radius: 10px; --padding-start: 0.9rem; --padding-end: 1rem; margin: 0; font-weight: 600; }
    .add-btn ion-icon { margin-inline-end: 0.35rem; }

    /* Selects de la toolbar: fondo + borde visibles (como el buscador y la pastilla de fechas) para
     * que se distingan como controles en claro y oscuro (sin fondo eran invisibles en dark). */
    .tk-cols { min-width: 6.5rem; max-width: 9rem; min-height: 38px; font-size: 13px; background: var(--background); color: var(--color); border: 1px solid var(--control-border); border-radius: 10px; --padding-start: 0.6rem; --padding-end: 0.4rem; --padding-top: 0.3rem; --padding-bottom: 0.3rem; }
    .vsep { width: 1px; align-self: stretch; background: var(--border-color); margin: 0.3rem 0.25rem; }

    /* Selector de filas/página en la toolbar (consolidado) */
    /* max-width: ion-select es display:block (sin core.css el host estira a la
     * línea entera cuando .bar-end hace wrap) — se capa como .tk-cols. */
    .tk-psize { min-width: 4.25rem; max-width: 5.5rem; min-height: 38px; font-size: 13px; background: var(--background); color: var(--color); border: 1px solid var(--control-border); border-radius: 10px; --padding-start: 0.6rem; --padding-end: 0.4rem; --padding-top: 0.35rem; --padding-bottom: 0.35rem; }

    /* Filtros EN LÍNEA en la toolbar (select / rango de fechas) */
    .tk-filter { min-width: 8.5rem; max-width: 13rem; min-height: 38px; font-size: 13px; background: var(--background); color: var(--color); border: 1px solid var(--control-border); border-radius: 10px; --padding-start: 0.7rem; --padding-end: 0.5rem; --padding-top: 0.35rem; --padding-bottom: 0.35rem; }
    .tk-daterange { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.3rem 0.6rem; min-height: 38px; border: 1px solid var(--control-border); border-radius: 10px; background: var(--background); color: var(--color-muted); font-size: 13px; }
    .tk-daterange ion-icon { font-size: 15px; flex: 0 0 auto; }
    .tk-daterange ion-input { --background: transparent; --padding-start: 0; --padding-end: 0; --padding-top: 2px; --padding-bottom: 2px; --color: var(--color); min-height: 26px; width: 6.8rem; font-size: 13px; }
    .tk-daterange .arr { color: var(--color-muted); }

    /* Barra contextual de selección */
    .selbar { display: flex; align-items: center; gap: 0.6rem; padding: 0.4rem 0.7rem; border-radius: 10px;
      font-size: 13px; color: var(--primary);
      background: color-mix(in srgb, var(--primary) 12%, transparent); }
    .selbar .sel-clear { margin-left: auto; display: inline-flex; align-items: center; gap: 0.25rem; cursor: pointer; font-weight: 500; color: inherit; background: none; border: 0; font: inherit; }
    .selbar .sel-clear:hover { text-decoration: underline; }

    /* Acordeones (alta / filtros en modo tarjetas) */
    .panel { padding: 0.85rem 1rem; border-bottom: 1px solid var(--border-color); background: var(--header-background); }
    .filters-panel { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.6rem; }

    /* ── Vista lista en CSS GRID (no <table>): permite ancho por columna ──────────────────── */
    /* #67 — La barra horizontal es PERMANENTE cuando hay desbordamiento: la overlay de macOS se
       esconde a los pocos ms y deja la tabla sin ninguna pista de que sigue a la derecha. Al
       declarar ::-webkit-scrollbar el navegador pinta la clásica, que ocupa sitio y se ve. */
    .scroll { overflow-x: auto; }
    .scroll::-webkit-scrollbar { height: 10px; }
    .scroll::-webkit-scrollbar-track { background: transparent; }
    .scroll::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--color) 25%, transparent); border-radius: 6px; }
    .scroll::-webkit-scrollbar-thumb:hover { background: color-mix(in srgb, var(--color) 40%, transparent); }
    /* #120 - The grid floor is the SUM OF THE COLUMN MINIMUMS (min-content), not its maximum
       size. With max-content the grid sizes itself to what the widest column asks for and, in
       doing so, every 1fr track ends up as wide AS THAT ONE: at 834px each column measured
       148.86px for content asking between 10px (a "4") and 100px ("Familia Perez"). The table
       always overflowed and the pinned actions column sat on top of Pax and Estado. With
       min-content the grid fits its container as long as the minimums fit, and 1fr shares out the
       leftover space; horizontal scroll shows up only when not even the minimums fit. */
    .grid { min-width: min-content; font-size: 14px; }
    .grow { display: grid; align-items: center; gap: 0.5rem; padding: 0 1rem; }
    .ghead { position: sticky; top: 0; z-index: 2; border-bottom: 1px solid var(--border-color);
      background: var(--header-background); padding-top: 0.55rem; padding-bottom: 0.55rem; }
    .gcell { display: flex; align-items: center; min-width: 0; }
    .gcell > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    /* #217 - A touch screen has no hover to show the cell's title, so in a table whose rows open
       nothing a tap on a clipped cell unfolds it in place (see onCellTap). Only that cell wraps; the rest of the row keeps
       its one line. The grid track does not move: its minimum is the column's fixed floor. */
    .gcell > span.unfolded { white-space: normal; overflow-wrap: anywhere; }
    .gcell.right { justify-content: flex-end; text-align: right; }
    .gcell.center { justify-content: center; text-align: center; }
    /* #67 - PINNED ACTIONS COLUMN. When the grid overflows (since #120 only when not even the
       column minimums fit; before that it happened with six columns and room to spare) the button
       that opens the record went off screen: at 1440px it sat 335px past the edge with nothing to
       give it away. It stays stuck to the right edge, like Zendesk/Freshdesk/Shopify. With
       background:inherit it takes the row background (which is opaque for this very reason), so it
       keeps hover and selection without anything showing through. */
    .gcell.actions-col { position: sticky; right: 0; z-index: 1; background: inherit;
      margin-right: -1rem; padding-right: 1rem; }
    /* La sombra solo aparece cuando de verdad hay algo escondido a la izquierda (clase x-overflow);
       si la tabla cabe entera no se pinta nada. */
    .scroll.x-overflow .gcell.actions-col { box-shadow: -10px 0 10px -10px color-mix(in srgb, var(--color) 45%, transparent); }
    /* #120 - The pinned header has to be OPAQUE. background:inherit took --header-background,
       which is a 4% alpha TINT (measured rgba(24,24,27,0.04)): when the grid overflows the
       "Acciones" header went see-through and "PAX" and "ESTADO" could be read through it - the
       "PAXCIONESTAD" of the issue. It now sits on the opaque table background with the tint laid
       back on top, the same way .grow-data:hover does. */
    .ghead .gcell.actions-col { z-index: 3;
      background: linear-gradient(var(--header-background), var(--header-background)), var(--background); }
    .gh { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-muted); }
    .gh.sortable { cursor: pointer; user-select: none; white-space: nowrap; transition: background-color var(--ok-transition, 150ms ease), color var(--ok-transition, 150ms ease), box-shadow var(--ok-transition, 150ms ease), transform 120ms ease; }
    @media (hover: hover) {
      .gh.sortable:hover { color: var(--color); }
    }
    /* Caret de orden (3 estados, icono Ionic): neutral atenuado / activo en color primario. */
    .caret { display: inline-flex; align-items: center; margin-left: 0.25rem; flex: 0 0 auto; font-size: 13px; opacity: 0.3; }
    .caret.on { opacity: 1; color: var(--primary); }
    .grow-data { background: var(--background); border-bottom: 1px solid var(--border-color-soft); padding-top: 0.6rem; padding-bottom: 0.6rem; transition: background-color var(--ok-transition, 150ms ease), color var(--ok-transition, 150ms ease), box-shadow var(--ok-transition, 150ms ease), transform 120ms ease; }
    .grow-data:last-child { border-bottom: 0; }
    @media (hover: hover) {
      .grow-data:hover { background: linear-gradient(var(--row-hover), var(--row-hover)), var(--background); }
    }
    .grow-data:active { transform: scale(0.995); }
    .grow-data.selected { background: linear-gradient(color-mix(in srgb, var(--primary) 10%, transparent), color-mix(in srgb, var(--primary) 10%, transparent)), var(--background); }
    /* #67 — Fila clicable (opt-in row-clickable): es lo primero que intenta el usuario y lo que
       hacen Odoo, Jira SM, Shopify o Square en sus listados. */
    .grow-data.clickable { cursor: pointer; }
    .grow-data.clickable:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
    .selcb { display: flex; align-items: center; justify-content: center; }
    .filters-grow { padding-top: 0.4rem; padding-bottom: 0.6rem; }
    .filters-grow input, .filters-grow select { width: 100%; box-sizing: border-box; font: inherit; font-size: 13px; padding: 0.3rem 0.4rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--background); color: var(--color); }
    .range { display: flex; gap: 0.25rem; }

    /* ── Vista tarjetas ──────────────────────────────────────────────────────────────────── */
    /* Cada tarjeta mide SU contenido (no se estira al alto de la fila ni del contenedor):
       - grid-auto-rows: max-content → cada fila implícita = alto de su contenido. CLAVE: sin esto,
         en modo fill (grid de alto fijo + align-content:start) cuando las tarjetas no caben el
         navegador encoge los tracks de fila y las tarjetas se solapan.
       - align-content: start → empaqueta las filas arriba (no reparte el hueco sobrante estirando).
       - align-items: start → en una fila multi-columna cada tarjeta mide su propio contenido.
       En modo fill el grid es flex-child con overflow:auto → cuando las tarjetas no caben aparece el
       scroll DENTRO de la tabla (no crece hacia fuera). */
    .cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 0.75rem; padding: 1rem; grid-auto-rows: max-content; align-content: start; align-items: start; }
    /* Tarjeta = ion-card NATIVO de Ionic: su fondo, radio, elevación y padding son los de Ionic y NO
       se sobrescriben. Aquí solo se ajusta lo que el contexto de rejilla exige (margin) y los huecos
       que Ionic no trae (cabecera en fila, filas clave-valor, barra de acciones, resalte de selección). */
    ion-card.rcard { margin: 0; } /* la rejilla aporta el gap → sin esto el margin por defecto de ion-card lo duplica */
    ion-card.rcard.selected { outline: 2px solid var(--primary); outline-offset: -2px; }
    /* #74 — Tarjeta clicable (opt-in row-clickable): la mitad de #67 que faltaba. La vista de
       tarjetas es la que la tabla elige SOLA en móvil, así que sin esto el registro no se podía
       abrir desde un teléfono (medido con combos 0.1.4: 0 rowClick a 390px). */
    ion-card.rcard.clickable { cursor: pointer; }
    ion-card.rcard.clickable:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
    @media (prefers-reduced-motion: reduce) {
      .gh.sortable:hover, .gh.sortable:active,
      .grow-data:hover, .grow-data:active { transform: none; }
    }
    /* Header: ion-card-header as a single row (icon + title + checkbox), keeping Ionic's padding.
       #79 — flex-direction/flex-wrap are SPELLED OUT on purpose: in ios mode (the mode the Hub
       shell pins, ADR-0143) Ionic's own host CSS gives ion-card-header a column direction, so a
       rule that only sets display:flex inherits it and the three children stack on three lines.
       Under md the same rule looked right, which is why it shipped. */
    ion-card-header.rcard-head { display: flex; flex-direction: row; flex-wrap: nowrap; align-items: center; gap: 0.5rem; }
    .rcard-head .rc-icon { display: inline-flex; color: var(--primary); }
    .rcard-head .rc-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
    /* Cuerpo: ion-card-content (padding Ionic por defecto) con las filas clave-valor apiladas. */
    ion-card-content.rcard-body { display: flex; flex-direction: column; gap: 0.4rem; }
    .rrow { display: flex; justify-content: space-between; gap: 0.5rem; font-size: 13px; }
    .rrow .rk { color: var(--color-muted); }
    .rrow .rv { font-weight: 500; text-align: right; color: var(--color); }
    /* Barra de acciones (Ionic no trae "card actions"): pie alineado a la derecha, fondo transparente. */
    .ractions { display: flex; justify-content: flex-end; gap: 0.25rem; padding: 0 0.5rem 0.5rem; }
    /* ERPlora/appointments#154 - a card's action row must NEVER clip.
       The assumption was that they always fit across the card. With the eight actions an
       appointment carries they do not: on a 411dp phone the card leaves 363px and the buttons ask
       for 380px (8 x 44px of tap floor + 7 gaps of 4px). Without wrapping, justify-content:
       flex-end takes that difference off the START side, so the FIRST button - Cobrar - hung off
       the left edge of the card, clipped, with no scrollbar and nothing to say it was there.
       The wrap is scoped to the card on purpose: the LIST view's row is measured by its
       scrollWidth to pin the column track (#121), and a row that wraps changes width with the
       track it is measured against, which is the loop that measure avoids. */
    .ractions .actions { flex-wrap: wrap; }

    /* ── Estado vacío ────────────────────────────────────────────────────────────────────── */
    .empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.75rem; padding: 3.5rem 1rem; text-align: center; color: var(--color-muted); }
    /* pm#530 — Error state: same frame as the empty state, but its heading reads as text, not muted. */
    .load-error { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; padding: 3.5rem 1rem; text-align: center; color: var(--color-muted); }
    .load-error .load-error-title { color: var(--color); font-weight: 600; }
    .load-error .empty-ic { color: var(--ok-danger, var(--ion-color-danger, #c5000f)); }
    .load-error ion-button { margin-top: 0.25rem; }
    .empty .empty-ic, .load-error .empty-ic { display: grid; place-items: center; width: 3.25rem; height: 3.25rem; border-radius: 999px; background: var(--header-background); font-size: 26px; }

    .actions { display: flex; gap: 0.25rem; justify-content: flex-end; }
    /* #121 - The buttons NEVER shrink. Their track is pinned to the width measured here
       (the scrollWidth of .actions); if they could shrink, a narrow track would shrink the
       measurement, which would shrink the track again. flex: 0 0 auto is what makes the
       measurement a property of the CONTENT instead of a property of the current layout. */
    .actions ion-button { flex: 0 0 auto; }
    /* #240 - Stand-in of a row action hidden on this row: it keeps the button's width (so the
       others stay in their column) and paints nothing; aria-hidden + inert keep it out of the
       accessibility tree, the tab order and the click path. */
    .actions .action-gap { visibility: hidden; }
    /* #122 - Header of the actions column while the buttons are folded into the menu. "ACCIONES"
       measures 62.83px and the folded track is 44px: painted, it spills out of its own cell and
       over "Estado" - the very thing the issue is about. The column keeps its name for assistive
       tech and paints nothing. #211 - Same while expanded when the buttons leave no room for the
       label (one icon: 32-44px), instead of painting "ACCI…". */
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden;
      clip-path: inset(50%); white-space: nowrap; border: 0; }
    /* Las acciones de fila son icon-only y de tamaño small en escritorio. En tablet/móvil se
     * amplía el host completo (no solo el icono) para que el área táctil alcance 44×44 px. */
    @media (pointer: coarse), (max-width: 834px) {
      .actions ion-button { min-width: 44px; min-height: 44px; margin: 0; }
      .toolbtn { width: 44px; height: 44px; }
      .add-btn { min-height: 44px; }
      .pager .nav ion-button { min-width: 44px; min-height: 44px; margin: 0; }
      .load-error ion-button { min-height: 44px; --padding-start: 1rem; --padding-end: 1rem; }
    }
    /* Spinner de acción en curso (loading): contenido dentro del ion-button small (Ionic lo fija
     * a 28px en el :host, por eso width/height y no font-size). Cubre tabla y tarjetas: los
     * botones de fila siempre van dentro de .actions. */
    .actions ion-spinner { width: 18px; height: 18px; }

    /* ── Pie: contador + paginación ──────────────────────────────────────────────────────── */
    .pager { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.55rem 1rem; border-top: 1px solid var(--border-color); background: var(--header-background); font-size: 12.5px; color: var(--color-muted); }
    .pager .left { display: flex; align-items: center; gap: 0.6rem; }
    .pager .strong { font-weight: 600; color: var(--color); }
    .psize { font: inherit; font-size: 12.5px; padding: 0.2rem 0.35rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--background); color: var(--color); }
    .pager .nav { display: flex; align-items: center; gap: 0.2rem; }
    /* #78 — Pie en MÓVIL: un solo control «Cargar más» en lugar del pager numerado (Shopify
       IndexTable, Fresha, Square y Material hacen lo mismo: nadie pinta botones de página en un
       teléfono). Sin atributo fill: el sólido por defecto de Ionic es el único que pinta caja en
       modo ios (outfitkit#82 / ADR-0143). Los 44px son el área táctil mínima. */
    .pager .load-more { min-height: 44px; margin: 0; --padding-start: 1rem; --padding-end: 1rem; font-size: 13px; }
    .pager .nav .pp { font-weight: 600; color: var(--color); padding: 0 0.25rem; }
    /* Pager numerado: botón por página + «…» en los saltos (look del Hub). */
    /* #92 — min-width/height at 44px so a numbered page button matches the prev/next ion-button's
       own 44px tap target (line above): before this they were visibly smaller than their neighbors. */
    .pnum { min-width: var(--ok-tap-min, 44px); height: var(--ok-tap-min, 44px); padding: 0 0.4rem; border: 1px solid transparent; border-radius: 8px; background: none; font: inherit; font-size: 12.5px; font-weight: 600; color: var(--color); cursor: pointer; transition: background 0.12s, border-color 0.12s; }
    .pnum:hover { background: var(--row-hover); }
    .pnum.on { background: color-mix(in srgb, var(--primary) 14%, transparent); color: var(--primary); border-color: color-mix(in srgb, var(--primary) 40%, transparent); }
    .pgap { padding: 0 0.15rem; color: var(--color-muted); }
    ion-button { --box-shadow: none; }
  `;
  }
  static {
    this.MOBILE_BREAKPOINT = 640;
  }
  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("keydown", this.onKeydown);
    if (this.hasUpdated) this.observeSiblings();
    if (typeof window !== "undefined") {
      window.addEventListener("erplora:locale-changed", this.onLocaleChanged);
      window.addEventListener("resize", this.onWindowResize);
    }
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      this.mq = window.matchMedia(`(max-width: ${_OkDataTable2.MOBILE_BREAKPOINT}px)`);
      this.isMobile = this.mq.matches;
      const handler = (e6) => {
        const matches = "matches" in e6 ? e6.matches : this.mq?.matches ?? false;
        if (this.isMobile === matches) return;
        this.isMobile = matches;
        if (matches && this.cardViewEnabled) this.viewMode = "cards";
        else if (!matches && this.viewMode === "cards") this.viewMode = "table";
      };
      this.mq.addEventListener("change", handler);
      this._mqHandler = handler;
    }
  }
  /** #67 — Recalcula si la vista lista desborda a lo ancho (`scrollWidth > clientWidth`).
   *
   * Se mide después de renderizar, que es cuando el navegador ya conoce los anchos, y solo se
   * escribe el estado si CAMBIA: asignarlo siempre reprogramaría un render en bucle. */
  measureXOverflow() {
    const scroll = this.renderRoot?.querySelector?.(".scroll");
    const overflow = !!scroll && scroll.scrollWidth > scroll.clientWidth;
    if (this.xOverflow !== overflow) this.xOverflow = overflow;
  }
  /** #121 — Ancho natural de los botones de acción de una fila, para clavar su pista en px.
   *
   * Se lee del `scrollWidth` de `.actions`, que es el ancho de SU CONTENIDO: como los botones
   * llevan `flex: 0 0 auto` nunca se encogen, así que la medida no depende de lo ancha que sea la
   * pista en ese momento. Eso es lo que la hace estable: clavar la pista al ancho natural no
   * cambia el ancho natural, así que la siguiente medida sale igual y no hay bucle. */
  measureActionsTrack() {
    if (!this.actions.length) {
      if (this.actionsTrackPx !== 0) this.actionsTrackPx = 0;
      return;
    }
    const boxes = this.renderRoot?.querySelectorAll?.(".grow-data .gcell.actions-col .actions") ?? [];
    let width = 0;
    for (const el of boxes) width = Math.max(width, Math.ceil(el.scrollWidth));
    if (width > 0 && width !== this.actionsTrackPx) this.actionsTrackPx = width;
  }
  /** #211 - Does the header label fit the actions column, or would it be painted truncated?
   *
   * The label's `scrollWidth` is its natural width both painted and `.sr-only` (it never wraps),
   * and the cell's width is the track the buttons pinned in px: hiding or showing the label
   * changes neither, so the next measurement agrees with this one and nothing loops. Any change
   * of that track is a state change, so it re-renders and lands here through `updated`. */
  measureActionsLabel() {
    const cell = this.renderRoot?.querySelector?.(".ghead .gcell.actions-col");
    const label = cell?.querySelector("span");
    if (!cell || !label) return;
    const need = Math.ceil(label.scrollWidth);
    if (need <= 0 || cell.clientWidth <= 0) return;
    const cs = getComputedStyle(cell);
    const room = cell.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    const fits = need <= room;
    if (this.actionsLabelFits !== fits) this.actionsLabelFits = fits;
  }
  /** #122 — Decide si los botones de acción de la fila caben o se pliegan en el menú «⋮».
   *  El criterio y la garantía de que no oscila viven en `decideRowActionsFit`. */
  measureRowActionsFit() {
    const scroll = this.renderRoot?.querySelector?.(".scroll");
    if (!scroll) return;
    const next = decideRowActionsFit({
      containerWidth: scroll.clientWidth,
      contentWidth: scroll.scrollWidth,
      collapsed: this.rowActionsCollapsed,
      decidedAtWidth: this.fitDecidedAtWidth
    });
    this.fitDecidedAtWidth = next.decidedAtWidth;
    if (this.rowActionsCollapsed !== next.collapsed) this.rowActionsCollapsed = next.collapsed;
  }
  /** #218 — Marks the host `content-after` while an element in flow follows it in its parent (a
   *  heading and a second table, a notice). Out of flow does not count: an inline `ion-modal`
   *  (absolute until it reparents), a hidden block. Written only when it changes. */
  syncContentAfter() {
    let after = false;
    if (this.fill && typeof getComputedStyle === "function") {
      for (let el = this.nextElementSibling; el; el = el.nextElementSibling) {
        const cs = getComputedStyle(el);
        if (cs.display !== "none" && cs.position !== "absolute" && cs.position !== "fixed") {
          after = true;
          break;
        }
      }
    }
    if (this.hasAttribute("content-after") !== after) this.toggleAttribute("content-after", after);
  }
  /** #218 — (Re)starts watching the parent: children added/removed and a sibling shown or hidden
   *  (`hidden`/`style`/`class` on a direct child). Deeper mutations are ignored, and so are the
   *  table's own (the sheet insets write its `style` on every resize). */
  observeSiblings() {
    this.siblingsObserver?.disconnect();
    this.siblingsObserver = void 0;
    const parent = this.parentNode;
    if (this.fill && parent && typeof MutationObserver !== "undefined") {
      this.siblingsObserver = new MutationObserver((records) => {
        if (records.some((r6) => r6.target === parent || r6.target !== this && r6.target.parentNode === parent)) this.syncContentAfter();
      });
      this.siblingsObserver.observe(parent, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "style", "class"] });
    }
    this.syncContentAfter();
  }
  /** Engancha el observador al contenedor de scroll del render actual (cambia entre vistas). */
  observeXOverflow() {
    if (typeof ResizeObserver === "undefined") return;
    const scroll = this.renderRoot?.querySelector?.(".scroll");
    if (!scroll) return;
    this.xObserver ??= new ResizeObserver(() => {
      this.measureXOverflow();
      this.measureActionsTrack();
      this.measureRowActionsFit();
    });
    this.xObserver.disconnect();
    this.xObserver.observe(scroll);
    const grid = scroll.querySelector(".grid");
    if (grid) this.xObserver.observe(grid);
  }
  updated(changed) {
    if (changed.has("fill")) this.observeSiblings();
    this.observeXOverflow();
    this.measureXOverflow();
    if (changed.has("columns") || changed.has("actions") || changed.has("columnChoice") || changed.has("selectable")) {
      this.fitDecidedAtWidth = -1;
    }
    this.measureActionsTrack();
    this.measureActionsLabel();
    this.measureRowActionsFit();
    if (changed.has("panel")) this.syncSheetInsets();
    syncSearchbarInputName(this.shadowRoot, () => this.effSearchPlaceholder);
  }
  /** #75/#197 — Where the mobile sheet starts and ends. `position: fixed; inset: 0` painted it from
   *  y=0 to the screen edge: the app's `ion-header` (its own stacking context, above the content)
   *  covered the sheet's title and its only Close button — measured at 390×844 in the Appointments
   *  parity page — and the module tab bar (an `ion-footer` OUTSIDE `ion-content`) covered the last
   *  66px (ios) / 72px (md) of the sheet, so its Save button could not be tapped (inventory#105).
   *  CSS inside a shadow root cannot know where the content area begins or ends, so on open the
   *  table measures the closest `ion-content` (walking through shadow hosts) and hands both offsets
   *  over as custom properties, re-measuring them while the sheet stays open whenever the content
   *  resizes (rotation, a tab bar mounted late) or the window resizes; on close both are removed and
   *  the content stops being observed. Without an `ion-content` around, the sheet keeps the screen
   *  edge on both ends. */
  syncSheetInsets() {
    if (this.panel === "none") {
      this.style.removeProperty("--ok-sheet-top");
      this.style.removeProperty("--ok-sheet-bottom");
      this.sheetObserver?.disconnect();
      this.sheetContent = null;
      return;
    }
    let node = this;
    let content = null;
    while (node && !content) {
      const parent = node.parentNode ?? node.getRootNode?.()?.host ?? null;
      if (parent && parent.nodeType === Node.ELEMENT_NODE && parent.tagName === "ION-CONTENT") content = parent;
      node = parent === node ? null : parent;
    }
    const top = content ? Math.max(0, Math.round(content.getBoundingClientRect().top)) : 0;
    const bottom = content ? Math.max(0, Math.round(window.innerHeight - content.getBoundingClientRect().bottom)) : 0;
    this.style.setProperty("--ok-sheet-top", `${top}px`);
    this.style.setProperty("--ok-sheet-bottom", `${bottom}px`);
    if (typeof ResizeObserver !== "undefined") {
      this.sheetObserver ??= new ResizeObserver(() => {
        if (this.panel !== "none") this.syncSheetInsets();
      });
      if (content !== this.sheetContent) {
        this.sheetObserver.disconnect();
        if (content) this.sheetObserver.observe(content);
        this.sheetContent = content;
      }
    }
  }
  disconnectedCallback() {
    this.removeEventListener("keydown", this.onKeydown);
    if (typeof window !== "undefined") {
      window.removeEventListener("erplora:locale-changed", this.onLocaleChanged);
      window.removeEventListener("resize", this.onWindowResize);
    }
    this.xObserver?.disconnect();
    this.xObserver = void 0;
    this.siblingsObserver?.disconnect();
    this.siblingsObserver = void 0;
    this.sheetObserver?.disconnect();
    this.sheetObserver = void 0;
    this.sheetContent = null;
    if (this.mq) {
      const handler = this._mqHandler;
      if (handler) this.mq.removeEventListener("change", handler);
      this.mq = void 0;
    }
    super.disconnectedCallback();
  }
  // ── i18n: idioma del documento ← overrides explícitos de `.labels` ─────────────────────────
  get t() {
    const lang = typeof document === "undefined" ? "en" : document.documentElement.lang.toLowerCase();
    return { ...lang.startsWith("es") ? ES_LABELS : DEFAULT_LABELS2, ...this.labels };
  }
  /** Placeholder efectivo del buscador (prop explícita → label i18n → default inglés). */
  get effSearchPlaceholder() {
    return this.searchPlaceholder ?? this.t.search;
  }
  /** Mensaje efectivo de estado vacío (prop explícita → label i18n → default inglés). */
  get effEmptyMessage() {
    return this.emptyMessage ?? this.t.empty;
  }
  /** pm#530 — The last load failed: rows, «empty» and counts would all be claims about data the
   *  table does not have. */
  get loadFailed() {
    return !!this.error?.trim();
  }
  /** #171 — Effective "no matches" message (explicit prop → i18n label → English default). */
  get effNoMatchesMessage() {
    return this.noMatchesMessage ?? this.t.noMatches;
  }
  // ── Resolución de alias (compat + documentados) ──────────────────────────────────────────
  get effPageSizes() {
    return this.pageSizes ?? this.pageSizeOptions;
  }
  get effColumnPicker() {
    return this.columnPicker || this.columnSelector;
  }
  get effExport() {
    return this.csv || this.exportable;
  }
  get effImport() {
    return this.csv || this.importable;
  }
  /** ¿Está habilitado el conmutador de vista lista/tarjetas? */
  get viewToggle() {
    if (Array.isArray(this.views)) return this.views.length > 1;
    return this.views === true;
  }
  /** ¿Está disponible la vista tarjetas? (presente en `views` o `views === true`). */
  get cardViewEnabled() {
    if (Array.isArray(this.views)) return this.views.some((v3) => v3 === "cards" || v3 === "card");
    return this.views === true;
  }
  /** Columns painted now: the person's pick in the column chooser, else the column's own `hidden`.
   *  A hidden column is only not painted — it still filters, sorts and keeps its filter control
   *  (hub#2245), which read `columns`. */
  get visibleColumns() {
    return this.columns.filter((c5) => this.columnChoice.get(c5.key) ?? c5.hidden !== true);
  }
  setVisibleColumns(keys) {
    const visible = new Set(keys);
    this.columnChoice = new Map(this.columns.map((c5) => [c5.key, visible.has(c5.key)]));
    this.emit("columnsChange", { visible: keys });
  }
  // ── Selección ─────────────────────────────────────────────────────────────────────────────
  keyOf(row) {
    if (typeof this.rowKey === "function") return String(this.rowKey(row) ?? "");
    if (typeof this.rowKey === "string") return String(row[this.rowKey] ?? "");
    return String(row[this.rowKeyField] ?? "");
  }
  /** #143 — `<prefix>-<suffix>`, or `nothing` (= the attribute is not painted) when the host gave
   *  no prefix. A blank prefix counts as absent: `" "` would leave dangling `-add` hooks, identical
   *  on every table of the screen, which is exactly what the prefix prevents. */
  tid(suffix) {
    const prefix = this.testid?.trim();
    return prefix ? `${prefix}-${suffix}` : A;
  }
  get selection() {
    return this.selectedKeys ?? this.internalSelection;
  }
  setSelection(next) {
    if (!this.selectedKeys) this.internalSelection = next;
    this.emit("selectionChange", { keys: [...next] });
    this.requestUpdate();
  }
  toggleRow(key) {
    const next = new Set(this.selection);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.setSelection(next);
  }
  toggleAll(visible) {
    const keys = visible.map((r6) => this.keyOf(r6));
    const allOn = keys.length > 0 && keys.every((k2) => this.selection.has(k2));
    const next = new Set(this.selection);
    if (allOn) keys.forEach((k2) => next.delete(k2));
    else keys.forEach((k2) => next.add(k2));
    this.setSelection(next);
  }
  // ── CSV ─────────────────────────────────────────────────────────────────────────────────────
  csvEscape(v3) {
    const s5 = v3 === null || v3 === void 0 ? "" : String(v3);
    return /[",\n\r]/.test(s5) ? `"${s5.replace(/"/g, '""')}"` : s5;
  }
  /** Exporta las filas a CSV (cabeceras = column.key). Si no hay filas, exporta solo la estructura. */
  exportCsv() {
    const cols = this.columns;
    const head = cols.map((c5) => this.csvEscape(c5.key)).join(",");
    const lines = this.rows.map((r6) => cols.map((c5) => this.csvEscape(r6[c5.key])).join(","));
    const csv = [head, ...lines].join("\r\n");
    const blob = new Blob([CSV_BOM + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a3 = document.createElement("a");
    a3.href = url;
    a3.download = this.csvName;
    a3.click();
    URL.revokeObjectURL(url);
    const count = this.rows.length;
    this.emit("csvExport", { rows: count, count });
    this.emit("export", { rows: count, count });
  }
  parseCsv(text) {
    const out = [];
    let row = [];
    let field = "";
    let q = false;
    for (let i7 = 0; i7 < text.length; i7++) {
      const c5 = text[i7];
      if (q) {
        if (c5 === '"') {
          if (text[i7 + 1] === '"') {
            field += '"';
            i7++;
          } else q = false;
        } else field += c5;
      } else if (c5 === '"') q = true;
      else if (c5 === ",") {
        row.push(field);
        field = "";
      } else if (c5 === "\n" || c5 === "\r") {
        if (c5 === "\r" && text[i7 + 1] === "\n") i7++;
        row.push(field);
        field = "";
        if (row.length > 1 || row[0] !== "") out.push(row);
        row = [];
      } else field += c5;
    }
    if (field !== "" || row.length) {
      row.push(field);
      out.push(row);
    }
    const headers = out.shift() ?? [];
    const rows = out.map((r6) => Object.fromEntries(headers.map((h4, i7) => [h4, r6[i7] ?? ""])));
    return { headers, rows };
  }
  async onImportFile(ev) {
    const input = ev.target;
    const file = input.files?.[0];
    if (!file) return;
    const text = decodeCsvBuffer(await file.arrayBuffer());
    const { headers, rows } = this.parseCsv(text);
    this.emit("csvImport", { headers, rows, count: rows.length });
    this.emit("import", { headers, rows, count: rows.length });
    input.value = "";
  }
  toggle(p4) {
    this.panelTitle = "";
    if (p4 === "filters" && this.panel !== "filters") {
      this.filterDraft = this.cloneFilters(this.clientFilters);
    }
    if (this.panel === p4) this.closePanel("toggle");
    else this.panel = p4;
  }
  /** Closes the side panel and, if one was actually open, emits `panelClose` with the panel that
   *  was open and the reason it closed. No-op (no event) when the panel is already `'none'`.
   *
   *  outfitkit#195 — modules that load the edit form after an `await` (read the full row, then
   *  fill the form) listen to `panelClose` to discard that pending load if the person closes the
   *  panel meanwhile (X, backdrop, Escape) before the reply arrives. */
  closePanel(reason) {
    if (this.panel === "none") return;
    const panel = this.panel;
    this.panel = "none";
    this.emit("panelClose", { panel, reason });
  }
  // ── Filtros en memoria (modo cliente): borrador → aplicar. ───────────────────────────────────
  cloneFilters(src) {
    const out = {};
    for (const [k2, f3] of Object.entries(src)) {
      out[k2] = { values: f3.values ? new Set(f3.values) : void 0, from: f3.from, to: f3.to };
    }
    return out;
  }
  // Fija el conjunto de valores seleccionados de una columna (multi-select del drawer = ion-select).
  setFilterValues(key, values) {
    const next = this.cloneFilters(this.filterDraft);
    const clean = (values ?? []).filter((v3) => v3 != null && v3 !== "");
    if (clean.length) next[key] = { ...next[key], values: new Set(clean) };
    else next[key] = { ...next[key], values: void 0 };
    this.filterDraft = next;
  }
  setFilterRange(key, edge, value) {
    const next = this.cloneFilters(this.filterDraft);
    next[key] = { ...next[key], [edge]: value };
    this.filterDraft = next;
  }
  applyFilters() {
    const clean = {};
    for (const [k2, f3] of Object.entries(this.filterDraft)) {
      if (f3.values && f3.values.size > 0 || f3.from || f3.to) clean[k2] = f3;
    }
    this.clientFilters = clean;
    this.clientPage = 0;
    this.mobileShown = 0;
    this.closePanel("apply");
    this.emit("filterChange", { filters: this.serializeFilters(clean) });
  }
  clearFilters() {
    this.filterDraft = {};
  }
  /** #171 — "Show all" under the no-matches state: drops the search AND the column filters, so
   *  every row is back in one tap. Consumers listening to `filterChange` hear the reset. */
  resetSearchAndFilters() {
    const hadFilters = Object.keys(this.clientFilters).length > 0;
    this.q = "";
    this.clientFilters = {};
    this.filterDraft = {};
    this.clientPage = 0;
    this.mobileShown = 0;
    if (hadFilters) this.emit("filterChange", { filters: {} });
  }
  serializeFilters(src) {
    const out = {};
    for (const [k2, f3] of Object.entries(src)) {
      if (f3.values && f3.values.size > 0) out[k2] = [...f3.values];
      else if (f3.from || f3.to) out[k2] = { from: f3.from ?? "", to: f3.to ?? "" };
    }
    return out;
  }
  /** Opens the side panel (public API for the module, e.g. "edit" opens the pre-filled form).
   *  `mode` sets the default header («New» / «Edit»); `opts.title` replaces it (e.g. «Editing service — Brushing»). */
  open(panel = "create", opts = {}) {
    this.panelTitle = panel === "filters" ? "" : (opts.title ?? "").trim();
    this.panel = panel;
  }
  /** Closes the side panel (public API for the module). Emits `panelClose` with reason `'api'`
   *  when a panel was actually open (outfitkit#195); no-op when it was already closed. */
  close() {
    this.closePanel("api");
  }
  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
  get hasSearch() {
    return this.searchable || this.searchKeys.length > 0;
  }
  /** Columnas filtrables (con control en el panel de filtros). En cliente y en servidor. */
  get filterColumns() {
    return this.columns.filter((c5) => c5.filterable);
  }
  /** ¿Hay que mostrar el botón de Filtros? (cualquier columna filtrable). */
  get hasFilterRow() {
    return this.filterColumns.length > 0;
  }
  /** Nº de filtros activos → badge del botón Filtros. En servidor cuenta `filterValues` (#106): sin
   *  esto el embudo no daba NINGUNA señal de que la lista venía acotada. */
  get activeFilterCount() {
    if (this.serverSide) {
      return Object.keys(this.serverFilters).filter((k2) => this.serverFilterState(k2) !== void 0).length;
    }
    return Object.values(this.clientFilters).filter(
      (f3) => f3.values && f3.values.size > 0 || f3.from || f3.to
    ).length;
  }
  // ── Estado de filtro VISIBLE (#106) ──────────────────────────────────────────────────────────
  /** Traduce un valor de `filterValues` (la forma que emite `filterChange`) a la forma interna que
   *  usan los `render*Filter`. `undefined` = ese filtro no está puesto. */
  serverFilterState(key) {
    const raw = this.serverFilters[key];
    if (raw === void 0 || raw === null || raw === "") return void 0;
    if (Array.isArray(raw)) {
      const values = raw.filter((v3) => v3 !== null && v3 !== void 0 && v3 !== "").map((v3) => String(v3));
      return values.length ? { values: new Set(values) } : void 0;
    }
    if (typeof raw === "object") {
      const range = raw;
      const from = range.from === null || range.from === void 0 || range.from === "" ? void 0 : String(range.from);
      const to = range.to === null || range.to === void 0 || range.to === "" ? void 0 : String(range.to);
      return from !== void 0 || to !== void 0 ? { from, to } : void 0;
    }
    return { values: /* @__PURE__ */ new Set([String(raw)]) };
  }
  /** Estado de filtro efectivo de una columna: servidor → `filterValues`/espejo; cliente → memoria. */
  filterStateOf(key) {
    return this.serverSide ? this.serverFilterState(key) : this.clientFilters[key];
  }
  /** Fija (o borra) el valor visible de un filtro en el espejo de servidor. */
  setServerFilter(key, value) {
    const next = { ...this.serverFilters };
    const empty = value === void 0 || value === null || value === "" || Array.isArray(value) && value.length === 0;
    if (empty) delete next[key];
    else next[key] = value;
    this.serverFilters = next;
  }
  /** Fija UN extremo de un rango en el espejo. Los dos extremos viajan en eventos SEPARADOS
   *  (`{from}` y luego `{to}`), así que aquí se MEZCLA: reemplazar borraría el otro extremo. */
  setServerRangeEdge(key, edge, value) {
    const prev = this.serverFilters[key];
    const base = prev && typeof prev === "object" && !Array.isArray(prev) ? { ...prev } : {};
    base[edge] = value;
    const alive = (v3) => v3 !== void 0 && v3 !== null && v3 !== "";
    this.setServerFilter(key, alive(base.from) || alive(base.to) ? base : void 0);
  }
  /** What a column shows, as the multi-select filter offers and matches it (`format` text if any). */
  shownValue(col, row) {
    if (col.format) return col.format(row);
    return row[col.key];
  }
  /** #256 - What a client-side sort and a date range filter compare: `sortValue`, else the field
   *  itself when it is DATA — a number, boolean, `Date`, ISO date/time or NUMERIC string («100.00»,
   *  how the hub hands over money) — so «15/01/2027» sorts after «31/12/2026» and «9,50 €» before
   *  «100,00 €» (AG Grid, MUI DataGrid, TanStack Table). Any other field (words, a status code, a
   *  stored «Sale <uuid>» the cell prints as a document number), a missing field or an object keeps
   *  sorting by the `format` text the person reads, as before #256. A null field sorts last. */
  sortKey(col, row) {
    if (col.sortValue) return col.sortValue(row);
    const value = row[col.key];
    if (!col.format || value === null) return value;
    if (typeof value === "number" || typeof value === "boolean" || value instanceof Date) return value;
    if (typeof value === "string") {
      if (NUMERIC_TEXT.test(value)) return Number(value);
      if (ISO_DATE_OR_TIME.test(value)) return value;
    }
    return col.format(row);
  }
  /** Valores distintos de una columna (para los chips del filtro multi-select). */
  distinctValues(col) {
    const set = /* @__PURE__ */ new Set();
    for (const row of this.rows) {
      const v3 = this.shownValue(col, row);
      if (v3 != null && v3 !== "") set.add(String(v3));
    }
    return [...set].sort((a3, b3) => a3.localeCompare(b3));
  }
  /** Filas tras buscar + filtrar + ordenar EN MEMORIA (solo modo cliente). */
  get clientFiltered() {
    let result = this.rows;
    const needle = this.q.trim().toLowerCase();
    if (needle && this.searchKeys.length) {
      result = result.filter(
        (r6) => this.searchKeys.some((k2) => String(r6[k2] ?? "").toLowerCase().includes(needle))
      );
    }
    const fkeys = Object.keys(this.clientFilters);
    if (fkeys.length) {
      result = result.filter(
        (row) => fkeys.every((key) => {
          const f3 = this.clientFilters[key];
          const col = this.columns.find((c5) => c5.key === key);
          if (!col) return true;
          if (f3.values && f3.values.size > 0) {
            return f3.values.has(String(this.shownValue(col, row) ?? ""));
          }
          if (f3.from || f3.to) {
            const raw = this.sortKey(col, row);
            const t5 = raw == null ? NaN : new Date(raw).getTime();
            const from = f3.from ? new Date(f3.from).getTime() : -Infinity;
            const to = f3.to ? new Date(f3.to).getTime() + 864e5 - 1 : Infinity;
            return !Number.isNaN(t5) && t5 >= from && t5 <= to;
          }
          return true;
        })
      );
    }
    if (this.clientSort) {
      const col = this.columns.find((c5) => c5.key === this.clientSort);
      if (col) {
        const dir = this.clientSortDir === "asc" ? 1 : -1;
        result = [...result].sort((a3, b3) => {
          const va = this.sortKey(col, a3);
          const vb = this.sortKey(col, b3);
          if (va == null) return 1;
          if (vb == null) return -1;
          if (va < vb) return -1 * dir;
          if (va > vb) return 1 * dir;
          return 0;
        });
      }
    }
    return result;
  }
  /** #217 - The text cell of the list view. It keeps its one-line clip, and the full text rides
   *  along as the native `title` (hover, like MUI DataGrid, Ant Design's `ellipsis.showTitle` and
   *  ok-heatmap). Screen readers already get the whole text: the clip is only paint. */
  textCell(col, row, rowKey) {
    const text = String(this.cell(col, row) ?? "");
    const id = `${rowKey}\u241F${col.key}`;
    return b2`<span
      class=${this.unfoldedCells.has(id) ? "unfolded" : A}
      title=${text === "" ? A : text}
      @pointerdown=${this.notePointer}
      @click=${(e6) => this.onCellTap(e6, id)}
    >${text}</span>`;
  }
  /** #217 - A touch screen has no hover, so the `title` never shows there. A row that opens a
   *  record keeps opening it on the first tap (the record shows the full text; swallowing the tap
   *  would make "open" a two-tap gesture on some rows only). In a table whose rows open nothing, a
   *  tap on a clipped cell unfolds it in place. A cell that fits, and a mouse click, change nothing. */
  onCellTap(e6, id) {
    if (this.rowClickable || this.lastPointerType !== "touch") return;
    const span = e6.currentTarget;
    if (span.scrollWidth <= span.clientWidth) return;
    this.unfoldedCells = new Set(this.unfoldedCells).add(id);
  }
  cell(col, row) {
    if (col.format) return col.format(row);
    const v3 = row[col.key];
    return v3 === null || v3 === void 0 ? "" : String(v3);
  }
  /** ¿Es ordenable la columna? Servidor: opt-in (`sortable`). Cliente: por defecto SÍ (como el Hub),
   *  salvo `sortable: false` explícito. */
  isSortable(col) {
    return this.serverSide ? !!col.sortable : col.sortable !== false;
  }
  onHeaderClick(col) {
    if (!this.isSortable(col)) return;
    if (this.serverSide) {
      const dir = this.sort === col.key && this.sortDir === "asc" ? "desc" : "asc";
      this.emit("sortChange", { sort: col.key, dir });
      return;
    }
    this.mobileShown = 0;
    if (this.clientSort === col.key) {
      this.clientSortDir = this.clientSortDir === "asc" ? "desc" : "asc";
    } else {
      this.clientSort = col.key;
      this.clientSortDir = "asc";
    }
  }
  onFilterInput(col, ev) {
    const value = ev.target.value ?? "";
    this.setServerFilter(col.key, value);
    this.emit("filterChange", { col: col.key, value });
  }
  onRangeInput(col, edge, ev) {
    const raw = ev.target.value ?? "";
    const v3 = raw === "" ? "" : Number(raw);
    this.setServerRangeEdge(col.key, edge, v3);
    this.emit("filterChange", { col: col.key, value: { [edge]: v3 } });
  }
  onDateRangeInput(col, edge, ev) {
    const v3 = ev.target.value ?? "";
    this.setServerRangeEdge(col.key, edge, v3);
    this.emit("filterChange", { col: col.key, value: { [edge]: v3 } });
  }
  // ── Filtros EN LÍNEA (toolbar) ────────────────────────────────────────────────────────────
  // En modo cliente escriben directamente `clientFilters` (filtran en memoria); en servidor solo
  // emiten `filterChange`. Reutilizan la misma forma de filtro que el drawer (values / from / to).
  setClientFilter(key, patch) {
    const next = { ...this.clientFilters };
    const merged = { ...next[key], ...patch };
    const empty = (!merged.values || merged.values.size === 0) && !merged.from && !merged.to;
    if (empty) delete next[key];
    else next[key] = merged;
    this.clientFilters = next;
    this.clientPage = 0;
    this.mobileShown = 0;
  }
  // ion-select (select/multiselect) del panel de filtros (renderFilterControl). En servidor emite
  // `filterChange`; en cliente escribe `clientFilters` (multiselect ⇒ filtra por inclusión).
  onFilterSelect(col, value, multi) {
    if (this.serverSide) {
      const next = value ?? (multi ? [] : "");
      this.setServerFilter(col.key, next);
      this.emit("filterChange", { col: col.key, value: next });
      return;
    }
    if (multi) {
      const arr = Array.isArray(value) ? value.map((v3) => String(v3)) : value != null && value !== "" ? [String(value)] : [];
      this.setClientFilter(col.key, { values: arr.length ? new Set(arr) : void 0 });
    } else {
      const v3 = String(value ?? "");
      this.setClientFilter(col.key, { values: v3 ? /* @__PURE__ */ new Set([v3]) : void 0 });
    }
  }
  onInlineRange(col, edge, ev) {
    const v3 = ev.target.value ?? "";
    if (this.serverSide) {
      this.setServerRangeEdge(col.key, edge, v3);
      this.emit("filterChange", { col: col.key, value: { [edge]: v3 } });
      return;
    }
    this.setClientFilter(col.key, { [edge]: v3 || void 0 });
  }
  // Overflow menu: anchor the popover to the tapped button via Ionic's `ionShadowTarget`
  // (the retargeted `ev.target` after dispatch would be the whole table, since `trigger` does not
  // resolve inside Shadow DOM).
  openMenu(ev) {
    this.menuEv = shadowAnchorEvent(ev);
    this.menuOpen = true;
  }
  /** #122 — Opens the «⋮» menu of ONE row. A single popover for the whole table (one per row would
   *  be as many as there are rows), anchored to the tapped button via Ionic's `ionShadowTarget`
   *  (the retargeted `ev.target` after dispatch would be the whole table). */
  openRowMenu(ev, row) {
    ev.stopPropagation();
    this.rowMenuEv = shadowAnchorEvent(ev);
    this.rowMenuRow = row;
    this.rowMenuOpen = true;
  }
  /** #122 — Las mismas acciones de la fila, como lista. Respeta `disabled`/`loading` por fila: una
   *  acción que no se puede pulsar en su botón tampoco se puede pulsar aquí. */
  renderRowMenu() {
    const kept = this.rowMenuRow;
    if (!this.actions.length || !kept) return A;
    const key = this.keyOf(kept);
    const row = key && this.rows.find((r6) => this.keyOf(r6) === key) || kept;
    const actions = this.visibleActions(row);
    return b2`
      <ion-popover
        class="row-menu"
        .isOpen=${this.rowMenuOpen}
        .event=${this.rowMenuEv}
        dismiss-on-select="true"
        @didDismiss=${() => this.rowMenuOpen = false}
      >
        <ion-content>
          <ion-list lines="none">
            ${actions.map((a3) => {
      const disabled = a3.loading?.(row) === true || a3.disabled?.(row) === true;
      const label = typeof a3.label === "function" ? a3.label(row) : a3.label;
      return b2`
                <!-- #143 — The action is named the SAME collapsed or not, so one spec works at any
                     width. It carries the hook only while the direct buttons are NOT there: the
                     popover survives its dismissal («rowMenuRow» is not cleared), and if the table
                     widened again there would be TWO elements with the hook and «getByTestId»
                     would pick one at random. -->
                <ion-item
                  button
                  data-testid=${this.rowActionsFolded(actions) ? this.tid(`row-${key}-${a3.id}`) : A}
                  ?disabled=${disabled}
                  aria-disabled=${disabled ? "true" : A}
                  .detail=${false}
                  @click=${() => {
        if (disabled) return;
        this.rowMenuOpen = false;
        this.emit("rowAction", { actionId: a3.id, row });
      }}
                >
                  ${a3.icon ? b2`<ion-icon slot="start" .icon=${okIcon(a3.icon)} style=${ionTone(a3.color, "text") ?? A}></ion-icon>` : A}
                  <ion-label style=${ionTone(a3.color, "text") ?? A}>${label}</ion-label>
                </ion-item>
              `;
    })}
          </ion-list>
        </ion-content>
      </ion-popover>
    `;
  }
  // Aplica la vista inicial declarada (`default-view`) una sola vez, tras el primer render. Es la
  // forma robusta de arrancar en tarjetas sin depender de fijar `viewMode` por referencia (que
  // falla si la tabla monta detrás de un `v-if`/loading y el ref aún es null).
  firstUpdated() {
    this.applyInitialView();
  }
  /** Re-evalúa la vista inicial cada render mientras el usuario no haya elegido a mano.
   *
   * `firstUpdated` NO basta: decide una sola vez, y los consumidores que asignan las props por JS
   * DESPUÉS de insertar el elemento —lo normal en páginas renderizadas por el servidor— llegan
   * tarde. En ese momento `cardViewEnabled` aún era `false`, así que no se conmutaba; y el
   * listener de `matchMedia` solo dispara al CAMBIAR el viewport, cosa que en un móvil no pasa
   * nunca. La tabla se quedaba con scroll lateral para siempre.
   *
   * Medido en Android contra producción el 2026-08-02 con el bundle ya actualizado:
   *   `views` antes de insertar  → tarjetas
   *   `views` después de insertar → tabla   ← lo que hace la página
   */
  willUpdate(changed) {
    this.applyInitialView();
    if (changed.has("rows") && this.unfoldedCells.size) this.unfoldedCells = /* @__PURE__ */ new Set();
    if (changed.has("rows") || changed.has("actions")) {
      this.gapLabels.clear();
      this.slotActionsCache = null;
    }
    if (changed.has("filterValues")) this.serverFilters = { ...this.filterValues ?? {} };
    if (changed.has("search") && this.search !== void 0) {
      this.q = this.search;
      if (!this.serverSide) {
        this.clientPage = 0;
        this.mobileShown = 0;
      }
    }
    if (!this.serverSide && changed.has("rows") && this.mobileShown !== 0 && !this.sameRecords(changed.get("rows"), this.rows))
      this.mobileShown = 0;
  }
  /** hub#2245 — Same records, same order, told apart by their key. Rows without a key cannot be
   *  told apart, so they never count as the same (the window starts again, as before). */
  sameRecords(before, after) {
    if (!before || before.length !== after.length) return false;
    return after.every((row, i7) => {
      const key = this.keyOf(row);
      return key !== "" && key === this.keyOf(before[i7]);
    });
  }
  applyInitialView() {
    if (this.viewChosenByUser) return;
    if (this.isMobile && this.cardViewEnabled) {
      this.viewMode = "cards";
    } else if (this.defaultView === "cards" && this.cardViewEnabled) {
      this.viewMode = "cards";
    } else if (this.defaultView === "table") {
      this.viewMode = "table";
    }
  }
  setViewMode(mode) {
    this.viewChosenByUser = true;
    if (this.viewMode === mode) return;
    this.viewMode = mode;
    this.emit("viewChange", mode);
  }
  // Control de filtro de una columna, con componentes Ionic (mismos inputs que el form de alta).
  renderFilterControl(col) {
    if (!col.filterable) return A;
    const type = col.filterType ?? "text";
    const f3 = this.filterStateOf(col.key);
    if (type === "select" || type === "multiselect") {
      const multi = type === "multiselect";
      const opts = col.options ?? this.distinctValues(col).map((v3) => ({ value: v3, label: v3 }));
      const current = this.selectValue(f3, multi);
      return b2`
        <ion-select
          label=${col.header}
          label-placement="stacked"
          fill="outline" mode="md"
          ?multiple=${multi}
          interface="modal"
          .interfaceOptions=${{ cssClass: "ok-overlay" }}
          placeholder=${this.t.select}
          .value=${current}
          @ionChange=${(e6) => this.onFilterSelect(col, e6.detail.value, multi)}
        >
          ${multi ? A : b2`<ion-select-option value="">${this.t.select}</ion-select-option>`}
          ${opts.map((o7) => b2`<ion-select-option value=${o7.value}>${o7.label}</ion-select-option>`)}
        </ion-select>
      `;
    }
    if (type === "range" || type === "daterange") {
      const t5 = type === "daterange" ? "date" : "number";
      const onEdge = type === "daterange" ? this.onDateRangeInput.bind(this) : this.onRangeInput.bind(this);
      return b2`
        <div class="fblock">
          <span class="flabel">${col.header}</span>
          <div class="frange">
            <ion-input type=${t5} fill="outline" mode="md" placeholder=${type === "daterange" ? this.t.from : this.t.gte}
              .value=${f3?.from ?? ""}
              @ionInput=${(e6) => onEdge(col, "from", e6)}></ion-input>
            <ion-input type=${t5} fill="outline" mode="md" placeholder=${type === "daterange" ? this.t.to : this.t.lte}
              .value=${f3?.to ?? ""}
              @ionInput=${(e6) => onEdge(col, "to", e6)}></ion-input>
          </div>
        </div>
      `;
    }
    const inputType = type === "number" ? "number" : type === "date" ? "date" : "text";
    return b2`
      <ion-input
        type=${inputType}
        fill="outline" mode="md"
        label=${col.header}
        label-placement="stacked"
        placeholder=${this.t.filterPlaceholder}
        .value=${this.selectValue(f3, false)}
        @ionInput=${(e6) => this.onFilterInput(col, e6)}
      ></ion-input>
    `;
  }
  /** Valor para un control de un solo valor (`ion-select`/`ion-input`) o multi (`ion-select
   *  multiple`) a partir del estado de filtro interno. '' / [] = sin filtro. */
  selectValue(f3, multi) {
    const values = [...f3?.values ?? /* @__PURE__ */ new Set()];
    if (multi) return values;
    return values.length ? values[0] : "";
  }
  // Controles de filtro COMPACTOS para la toolbar (modo `inlineFilters`). Solo select y rango de
  // fechas (los del screenshot); el resto de tipos siguen disponibles vía el drawer si no se activa
  // `inlineFilters`. Look: «Todos los Estados» (placeholder) / «01/10/25 → 18/10/25».
  renderInlineFilters() {
    const cols = this.filterColumns.filter((c5) => {
      const t5 = c5.filterType ?? "text";
      return t5 === "select" || t5 === "multiselect" || t5 === "date" || t5 === "daterange";
    });
    if (!cols.length) return A;
    return b2`${cols.map((c5) => this.renderInlineFilter(c5))}`;
  }
  renderInlineFilter(col) {
    const type = col.filterType ?? "text";
    const f3 = this.filterStateOf(col.key);
    if (type === "select" || type === "multiselect") {
      const multi = type === "multiselect";
      const opts = col.options ?? this.distinctValues(col).map((v3) => ({ value: v3, label: v3 }));
      const current = this.selectValue(f3, multi);
      return b2`
        <ion-select
          class="tk-filter"
          ?multiple=${multi}
          interface="modal"
          .interfaceOptions=${{ cssClass: "ok-overlay" }}
          aria-label=${col.header}
          placeholder=${col.header}
          .value=${current}
          @ionChange=${(e6) => this.onFilterSelect(col, e6.detail.value, multi)}
        >
          ${multi ? A : b2`<ion-select-option value="">${col.header}</ion-select-option>`}
          ${opts.map((o7) => b2`<ion-select-option value=${o7.value}>${o7.label}</ion-select-option>`)}
        </ion-select>
      `;
    }
    return b2`
      <span class="tk-daterange" role="group" aria-label=${col.header}>
        <ion-icon .icon=${iconCalendarOutline}></ion-icon>
        <ion-input type="date" aria-label=${this.t.fromOf.replace("{label}", col.header)} .value=${f3?.from ?? ""} @ionChange=${(e6) => this.onInlineRange(col, "from", e6)}></ion-input>
        <span class="arr">→</span>
        <ion-input type="date" aria-label=${this.t.toOf.replace("{label}", col.header)} .value=${f3?.to ?? ""} @ionChange=${(e6) => this.onInlineRange(col, "to", e6)}></ion-input>
      </span>
    `;
  }
  // Menú overflow («⋮») con ion-popover anclado por evento (Shadow-DOM-safe).
  renderOverflowMenu() {
    if (!this.menuActions.length) return A;
    return b2`
      <ion-button class="toolbtn" fill="clear" aria-label=${this.t.moreActions} @click=${(e6) => this.openMenu(e6)}>
        <ion-icon slot="icon-only" .icon=${iconEllipsisVertical}></ion-icon>
      </ion-button>
      <ion-popover
        .isOpen=${this.menuOpen}
        .event=${this.menuEv}
        dismiss-on-select="true"
        @didDismiss=${() => this.menuOpen = false}
      >
        <ion-content>
          <ion-list lines="none">
            ${this.menuActions.map(
      (a3) => b2`
                <ion-item button .detail=${false} @click=${() => {
        this.menuOpen = false;
        this.emit("menuAction", { actionId: a3.id });
      }}>
                  ${a3.icon ? b2`<ion-icon slot="start" .icon=${okIcon(a3.icon)} style=${ionTone(a3.color, "text") ?? A}></ion-icon>` : A}
                  <ion-label style=${ionTone(a3.color, "text") ?? A}>${a3.label}</ion-label>
                </ion-item>
              `
    )}
          </ion-list>
        </ion-content>
      </ion-popover>
    `;
  }
  // Row action buttons, shared by the table and the card views.
  //
  // `collapsible` = the LIST view, the only one that folds its buttons into a "⋮" menu when the
  // columns leave it no width (#122). The CARD view does not fold; it WRAPS instead, see
  // `.ractions .actions` in the stylesheet.
  //
  // This comment used to claim that a card's actions "always fit across the card". They do not,
  // and nobody had measured it (#132 / ERPlora/appointments#154): with the eight actions an
  // appointment carries, the row asks for 380px and the card gives 379px at 411dp, 237px at 768px
  // and 272px at 1440px — so the first button hung off the card at ALL THREE widths, not just on
  // a phone. If you add a view that lays these buttons out, MEASURE it.
  /** hub#2014 — The row actions that exist for THIS row (`hidden` filtered out), in their order. */
  visibleActions(row) {
    return this.actions.filter((a3) => a3.hidden?.(row) !== true);
  }
  /** #213 — Are THESE row actions folded into the "..." menu? Only when the list view folds (#122)
   *  AND there is more than one: an overflow menu groups several actions, it never replaces a
   *  single one (Polaris, MUI DataGrid) — it would take the same width and cost one more tap.
   *  Except a single TEXT-only action (no icon): its button is wider than the "..." one, and left
   *  out it spills over the data columns (measured at 390px), so folding it does free width. */
  rowActionsFolded(actions) {
    return this.rowActionsCollapsed && (actions.length > 1 || actions.length === 1 && !actions[0].icon);
  }
  gapLabel(a3) {
    if (typeof a3.label !== "function") return a3.label;
    let text = this.gapLabels.get(a3);
    if (text === void 0) {
      const shown = this.rows.find((r6) => a3.hidden?.(r6) !== true);
      text = shown ? a3.label(shown) : "";
      this.gapLabels.set(a3, text);
    }
    return text;
  }
  slotActions() {
    return this.slotActionsCache ??= this.actions.filter((a3) => this.rows.some((r6) => a3.hidden?.(r6) !== true));
  }
  actionButtons(row, collapsible = false) {
    if (!this.actions.length) return A;
    const key = this.keyOf(row);
    const actions = this.visibleActions(row);
    if (collapsible && this.rowActionsCollapsed) {
      if (!actions.length) return b2`<div class="actions"></div>`;
      if (this.rowActionsFolded(actions)) return b2`
        <div class="actions">
          <ion-button
            size="small"
            fill="clear"
            style=${ionTone("medium", "clear")}
            data-testid=${this.tid(`row-${key}-menu`)}
            aria-label=${this.t.moreActions}
            title=${this.t.moreActions}
            aria-haspopup="menu"
            @click=${(e6) => this.openRowMenu(e6, row)}
          >
            <ion-icon slot="icon-only" .icon=${okIcon(iconEllipsisVertical)}></ion-icon>
          </ion-button>
        </div>
      `;
    }
    const slots = collapsible && !this.rowActionsCollapsed ? this.slotActions() : actions;
    return b2`
      <div class="actions">
        ${slots.map(
      (a3) => {
        if (a3.hidden?.(row) === true) {
          return b2`
              <ion-button class="action-gap" size="small" fill="clear" data-slot-for=${a3.id} aria-hidden="true" inert>
                ${a3.icon ? b2`<ion-icon slot="icon-only" .icon=${okIcon(a3.icon)}></ion-icon>` : this.gapLabel(a3)}
              </ion-button>
            `;
        }
        const loading = a3.loading?.(row) === true;
        const disabled = loading || a3.disabled?.(row) === true;
        const label = typeof a3.label === "function" ? a3.label(row) : a3.label;
        return b2`
            <ion-button
              size="small"
              fill="clear"
              style=${ionTone(a3.color ?? "medium", "clear") ?? A}
              data-testid=${this.tid(`row-${key}-${a3.id}`)}
              ?disabled=${disabled}
              aria-disabled=${disabled ? "true" : A}
              aria-label=${label}
              title=${label}
              @click=${() => this.emit("rowAction", { actionId: a3.id, row })}
            >
              ${loading ? b2`<ion-spinner slot="icon-only" name="dots"></ion-spinner>` : a3.icon ? b2`<ion-icon slot="icon-only" .icon=${okIcon(a3.icon)}></ion-icon>` : label}
            </ion-button>
          `;
      }
    )}
      </div>
    `;
  }
  // Icon-only bar button (filters / create / view switch). `on` = active look.
  // Optional `badge` → counter (e.g. number of active filters), Hub look.
  // #247 - `toggle` makes it a toggle button: `on` is also announced as `aria-pressed`, so a screen
  // reader hears which view is on instead of it living only in the fill. Ionic 8 copies
  // `aria-pressed` to its inner <button> and watches it, so every later switch reaches the AX tree.
  toolButton(icon, on, onClick, label, badge, testid = A, toggle = false) {
    return b2`
      <ion-button class="toolbtn" size="small" fill=${on ? "solid" : "outline"} data-testid=${testid} title=${label} aria-label=${label} aria-pressed=${toggle ? String(on) : A} @click=${onClick}>
        <ion-icon slot="icon-only" .icon=${okIcon(icon)}></ion-icon>
        ${badge && badge > 0 ? b2`<span class="badge">${badge}</span>` : A}
      </ion-button>
    `;
  }
  /** Plantilla de columnas del grid de la vista lista: [checkbox] [columnas…] [acciones]. */
  gridTemplate() {
    return [
      this.selectable ? "2.75rem" : null,
      // #120 - 5.5rem (88px) is the narrowest a data column can be and stay readable: ~11
      // characters at 14px, plus the ellipsis `.gcell > span` already applies. With the previous
      // floor (8rem = 128px) the six columns of a bookings list did not fit the counter tablet
      // (128x6 + 188 for actions + gaps = 1036px against 834) and the pinned column ended up on
      // top of the data. With 5.5rem they fit (796px) and `1fr` stretches them to 94px each.
      ...this.visibleColumns.map((c5) => c5.width ?? "minmax(5.5rem,1fr)"),
      // #121 - a LENGTH, not `max-content`. The header and every row are separate grids that
      // share this string, and a content-sized track is not a length: each grid resolves it
      // against ITS OWN content - the word "ACCIONES" (62.83px) in the header, four buttons
      // (188px) in the row. The leftover the `1fr` columns share then differed between the two,
      // and the header slid right, up to 125px by the last column (measured at 834px).
      // `actionsTrackPx` is the width of the buttons MEASURED on screen, so it also keeps #120's
      // contract: the track never shrinks under its content (an `auto` track collapsed to 16px
      // and the buttons spilled over the neighbouring column). Until the first measurement lands
      // - one frame - `max-content` reserves the same room it always did.
      this.actions.length ? this.actionsTrackPx > 0 ? `${this.actionsTrackPx}px` : "max-content" : null
    ].filter(Boolean).join(" ");
  }
  /** Lista de páginas a mostrar en el pager numerado (1-based): primera, última, vecinas de la
   *  actual y «…» donde haya saltos. P.ej. en página 1 de 52 → [1,2,3,'…',52]. */
  pageList(cur1, total) {
    if (total <= 7) return Array.from({ length: total }, (_2, i7) => i7 + 1);
    const want = /* @__PURE__ */ new Set([1, total, cur1, cur1 - 1, cur1 + 1]);
    if (cur1 <= 3) [2, 3].forEach((p4) => want.add(p4));
    if (cur1 >= total - 2) [total - 1, total - 2].forEach((p4) => want.add(p4));
    const sorted = [...want].filter((p4) => p4 >= 1 && p4 <= total).sort((a3, b3) => a3 - b3);
    const out = [];
    let prev = 0;
    for (const p4 of sorted) {
      if (p4 - prev > 1) out.push("\u2026");
      out.push(p4);
      prev = p4;
    }
    return out;
  }
  render() {
    const ps = this.serverSide ? this.pageSize : this.clientPageSize || this.pageSize;
    let visible;
    let pages;
    let current;
    let count;
    if (this.serverSide) {
      visible = this.rows;
      count = this.total;
      pages = Math.max(1, Math.ceil(this.total / ps));
      current = Math.min(this.page, pages - 1);
    } else {
      const filtered = this.clientFiltered;
      count = filtered.length;
      pages = Math.max(1, Math.ceil(filtered.length / ps));
      current = Math.min(this.clientPage, pages - 1);
      visible = this.isMobile ? filtered.slice(0, Math.min(this.mobileShown || ps, count)) : filtered.slice(current * ps, current * ps + ps);
    }
    const served = this.serverSide ? (current + 1) * ps : Math.min(this.mobileShown || ps, count);
    const canLoadMore = this.isMobile && served < count;
    const rangeTo = this.isMobile && !this.serverSide ? Math.min(served, count) : Math.min((current + 1) * ps, count);
    const rangeFrom = !this.isMobile ? current * ps + 1 : this.serverSide ? this.rows.length ? Math.max(1, rangeTo - this.rows.length + 1) : current * ps + 1 : 1;
    const loadMore = () => {
      if (this.serverSide) this.emit("pageChange", current + 1);
      else this.mobileShown = Math.min((this.mobileShown || ps) + ps, count);
    };
    const goTo = (p4) => {
      if (this.serverSide) this.emit("pageChange", p4);
      else this.clientPage = p4;
    };
    const setPageSize = (n6) => {
      if (this.serverSide) this.emit("pageSizeChange", n6);
      else {
        this.clientPageSize = n6;
        this.clientPage = 0;
        this.mobileShown = 0;
      }
    };
    const searchbar = b2`<ion-searchbar class="ion-no-border" data-testid=${this.tid("search")} .value=${this.q} placeholder=${this.effSearchPlaceholder} debounce="250" @ionInput=${this.onSearch}></ion-searchbar>`;
    const selCount = this.selection.size;
    const showTopbar = !!this.title || this.hasSearch || this.viewToggle || this.effColumnPicker || this.effExport || this.effImport || this.hasFilterRow || this.addable || !!this.primaryAction;
    return b2`
      <div class=${`card${this.panel !== "none" ? " has-panel" : ""}`}>
        ${showTopbar ? b2`
              <div class="bar">
                <div class="bar-main">
                  ${this.title ? b2`<div class="title-wrap"><h2 class="title">${this.title}</h2>${this.loadFailed ? A : b2`<span class="title-count">${count}</span>`}</div>` : A}
                  ${this.hasSearch ? b2`<div class="search">${searchbar}</div>` : A}
                  ${this.inlineFilters ? this.renderInlineFilters() : A}
                  <span class="tk-spacer"></span>
                    ${this.effColumnPicker && !this.isMobile ? b2`
                          <ion-select
                            class="tk-cols"
                            multiple
                            interface="popover"
                            aria-label=${this.t.columnsVisible}
                            .value=${this.visibleColumns.map((c5) => c5.key)}
                            .selectedText=${this.t.columns}
                            @ionChange=${(e6) => this.setVisibleColumns(e6.detail.value)}
                          >
                            ${this.columns.map((c5) => b2`<ion-select-option value=${c5.key}>${c5.header}</ion-select-option>`)}
                          </ion-select>
                        ` : A}
                    ${this.effPageSizes.length && !this.isMobile ? b2`
                          <ion-select
                            class="tk-psize"
                            interface="popover"
                            aria-label=${this.t.rowsPerPage}
                            .value=${ps}
                            @ionChange=${(e6) => setPageSize(Number(e6.detail.value))}
                          >
                            ${this.effPageSizes.map((n6) => b2`<ion-select-option .value=${n6}>${n6}</ion-select-option>`)}
                          </ion-select>
                        ` : A}
                    ${this.viewToggle ? b2`
                          <span class="viewseg">
                            ${this.toolButton("list-outline", this.viewMode === "table", () => this.setViewMode("table"), this.t.viewList, void 0, A, true)}
                            ${this.toolButton("grid-outline", this.viewMode === "cards", () => this.setViewMode("cards"), this.t.viewCards, void 0, A, true)}
                          </span>
                        ` : A}
                    ${this.hasFilterRow && !this.inlineFilters ? this.toolButton("funnel-outline", this.panel === "filters" || this.activeFilterCount > 0, () => this.toggle("filters"), this.t.filters, this.activeFilterCount) : A}
                    ${this.effImport ? b2`
                          ${this.toolButton("cloud-upload-outline", false, () => this.renderRoot.querySelector(".tk-file")?.click(), this.t.importCsv)}
                          <!-- #143 — The import hook goes on the INPUT, not on the button that
                               triggers it: what a spec drives is «setInputFiles», and nobody opens
                               the button's native dialog from a test. Same criterion as
                               «GrantFilePicker.vue» in the Hub (the hook goes on the control, not
                               on its disguise). -->
                          <input class="tk-file" data-testid=${this.tid("csv-import")} type="file" accept=".csv,text/csv" hidden @change=${(e6) => this.onImportFile(e6)} />
                        ` : A}
                    ${this.effExport ? this.toolButton("download-outline", false, () => this.exportCsv(), this.t.exportCsv, void 0, this.tid("csv-export")) : A}
                    <!-- #113 — Mismo botón en los dos viewports: la acción principal de la pantalla
                         se lee, no se adivina. En escritorio era un «+» de 36px idéntico a los
                         iconos de vista/filtrar/exportar, y era el último de cuatro. -->
                    ${this.addable ? b2`
                          <ion-button class="primary-btn add-btn" data-testid=${this.tid("add")} size="small" @click=${() => this.toggle("create")}>
                            <ion-icon slot="start" .icon=${okIcon("add")}></ion-icon>${this.t.add}
                          </ion-button>
                        ` : A}
                    ${this.renderOverflowMenu()}
                    ${this.primaryAction ? b2`
                          <!-- #143 — Its own hook and NOT «-add»: «addable» and «primaryAction» are
                               two different buttons that may coexist, and both are really used
                               («addable» in the modules, «primaryAction» in the SaaS screens).
                               Sharing the name would give two elements with the same hook as soon
                               as a screen declared both. -->
                          <ion-button class="primary-btn add-btn" data-testid=${this.tid("primary-action")} size="small" @click=${() => this.emit("primaryAction", {})}>
                            <ion-icon slot="start" .icon=${okIcon(this.primaryAction.icon ?? "add")}></ion-icon>${this.primaryAction.label}
                          </ion-button>
                        ` : A}
                    <!-- El módulo proyecta aquí acciones globales adicionales. -->
                    <slot name="toolbar"></slot>
                </div>
                ${this.selectable && selCount > 0 ? b2`
                      <div class="selbar">
                        <strong>${this.t.selected.replace("{n}", String(selCount))}</strong>
                        <button class="sel-clear" @click=${() => this.setSelection(/* @__PURE__ */ new Set())}>
                          <ion-icon .icon=${iconClose} style="font-size:14px"></ion-icon> ${this.t.clear}
                        </button>
                      </div>
                    ` : A}
              </div>
            ` : A}

        ${this.loadFailed ? this.errorState() : this.viewMode === "cards" && this.cardViewEnabled ? this.renderCards(visible) : this.renderTable(visible)}

        ${!this.loadFailed && (pages > 1 || this.effPageSizes.length) ? b2`
              <div class="pager">
                <div class="left">
                  <span>
                    ${pages > 1 ? b2`${this.t.showing.replace("{from}", String(rangeFrom)).replace("{to}", String(rangeTo))} ` : A}
                    <span class="strong">${count}</span> ${count === 1 ? this.t.recordSingular : this.t.recordPlural}
                  </span>
                  ${!showTopbar && this.effPageSizes.length ? b2`
                        <select class="psize" @change=${(e6) => setPageSize(Number(e6.target.value))}>
                          ${this.effPageSizes.map((n6) => b2`<option value=${n6} ?selected=${n6 === ps}>${this.t.perPageShort.replace("{n}", String(n6))}</option>`)}
                        </select>
                      ` : A}
                </div>
                ${this.isMobile ? canLoadMore ? b2`<ion-button class="load-more" data-testid=${this.tid("load-more")} size="small" @click=${loadMore}>${this.t.loadMore}</ion-button>` : A : pages > 1 ? b2`
                      <div class="nav">
                        <ion-button size="small" fill="clear" data-testid=${this.tid("page-prev")} ?disabled=${current === 0} @click=${() => goTo(current - 1)}><ion-icon slot="icon-only" .icon=${iconChevronBack}></ion-icon></ion-button>
                        ${this.pageList(current + 1, pages).map(
      (p4) => p4 === "\u2026" ? b2`<span class="pgap">…</span>` : b2`<button class=${`pnum${p4 === current + 1 ? " on" : ""}`} @click=${() => goTo(p4 - 1)}>${p4}</button>`
    )}
                        <ion-button size="small" fill="clear" data-testid=${this.tid("page-next")} ?disabled=${current >= pages - 1} @click=${() => goTo(current + 1)}><ion-icon slot="icon-only" .icon=${iconChevronForward}></ion-icon></ion-button>
                      </div>
                    ` : A}
              </div>
            ` : A}

        ${this.panel !== "none" ? this.renderDrawer() : A}
      </div>
    `;
  }
  // Panel lateral derecho DENTRO de la tabla (no empuja contenido; igual en lista y tarjetas).
  renderDrawer() {
    const isFilters = this.panel === "filters";
    const clientFilters = isFilters && !this.serverSide;
    const serverFilters = isFilters && this.serverSide;
    const title = isFilters ? this.t.filters : this.panelTitle || (this.panel === "edit" ? this.t.editRecord : this.t.newRecord);
    return b2`
      <div class="tk-scrim" @click=${() => this.closePanel("backdrop")}></div>
      <aside class="drawer" role="dialog" aria-label=${title}>
        <header class="dh">
          <strong>${title}</strong>
          <ion-button fill="clear" size="small" aria-label=${this.t.close} @click=${() => this.closePanel("close-button")}><ion-icon slot="icon-only" .icon=${iconClose}></ion-icon></ion-button>
        </header>
        <div class="db">
          ${isFilters ? clientFilters ? this.filterColumns.map((c5) => this.renderClientFilter(c5)) : this.filterColumns.map((c5) => b2`<div class="fblock">${this.renderFilterControl(c5)}</div>`) : b2`<slot name="create"></slot>`}
        </div>
        ${clientFilters ? b2`
              <footer class="df">
                <button class="sel-clear df-clear" ?disabled=${Object.keys(this.filterDraft).length === 0} @click=${() => this.clearFilters()}>${this.t.clear}</button>
                <ion-button class="primary-btn" size="small" @click=${() => this.applyFilters()}>${this.t.apply}</ion-button>
              </footer>
            ` : serverFilters ? b2`
                <footer class="df">
                  <ion-button class="primary-btn df-done" expand="block" data-testid=${this.tid("filters-show-results")} @click=${() => this.closePanel("apply")}>${this.t.showResults}</ion-button>
                </footer>
              ` : A}
      </aside>
    `;
  }
  // Control de filtro CLIENTE de una columna: chips multi-select (select) o rango de fechas.
  renderClientFilter(col) {
    const label = col.header;
    if (col.filterType === "daterange" || col.filterType === "date") {
      const f3 = this.filterDraft[col.key] ?? {};
      return b2`
        <div class="fblock">
          <span class="flabel">${label}</span>
          <div class="daterange">
            <ion-input type="date" label=${this.t.from} label-placement="stacked" fill="outline" mode="md" .value=${f3.from ?? ""} @ionChange=${(e6) => this.setFilterRange(col.key, "from", e6.detail.value ?? "")}></ion-input>
            <ion-input type="date" label=${this.t.to} label-placement="stacked" fill="outline" mode="md" .value=${f3.to ?? ""} @ionChange=${(e6) => this.setFilterRange(col.key, "to", e6.detail.value ?? "")}></ion-input>
          </div>
        </div>
      `;
    }
    const opts = col.options ?? this.distinctValues(col).map((v3) => ({ value: v3, label: v3 }));
    const selected = [...this.filterDraft[col.key]?.values ?? /* @__PURE__ */ new Set()];
    return b2`
      <div class="fblock">
        <ion-select
          label=${label}
          label-placement="stacked"
          fill="outline" mode="md"
          multiple
          interface="modal"
          .interfaceOptions=${{ cssClass: "ok-overlay" }}
          placeholder=${this.t.select}
          .value=${selected}
          @ionChange=${(e6) => this.setFilterValues(col.key, e6.detail.value ?? [])}
        >
          ${opts.length === 0 ? b2`<ion-select-option .disabled=${true} value="">${this.t.noValues}</ion-select-option>` : opts.map((o7) => b2`<ion-select-option value=${o7.value}>${o7.label}</ion-select-option>`)}
        </ion-select>
      </div>
    `;
  }
  /** #67 — Enter/Espacio activan la fila clicable (y, desde #74, la tarjeta): si se llega con el
   *  tabulador, el ratón no puede ser el único camino. Espacio además NO debe desplazar la página. */
  onRowKeydown(e6, row) {
    if (e6.key !== "Enter" && e6.key !== " " && e6.key !== "Spacebar") return;
    e6.preventDefault();
    this.emit("rowClick", { row });
  }
  emptyState() {
    const noMatches = this.rows.length > 0;
    return b2`
      <div class="empty">
        <span class="empty-ic"><ion-icon .icon=${iconFileTrayOutline}></ion-icon></span>
        <span>${noMatches ? this.effNoMatchesMessage : this.effEmptyMessage}</span>
        ${noMatches ? b2`<ion-button fill="clear" size="small" data-role="no-matches-reset" data-testid=${this.tid("show-all")} @click=${() => this.resetSearchAndFilters()}>${this.t.showAll}</ion-button>` : A}
      </div>
    `;
  }
  /** pm#530 — The load failed. Not the empty state: «No customers» over a hub that did not answer
   *  made people believe their data was gone. Says so, gives the reason and offers to retry. */
  errorState() {
    return b2`
      <div class="load-error" role="alert" data-role="load-error">
        <span class="empty-ic"><ion-icon .icon=${okIcon("alert-circle-outline")}></ion-icon></span>
        <strong class="load-error-title">${this.t.loadError}</strong>
        <span class="load-error-reason">${this.error}</span>
        <ion-button size="small" data-role="load-error-retry" data-testid=${this.tid("retry")} @click=${() => this.emit("retry", {})}>${this.t.retry}</ion-button>
      </div>
    `;
  }
  // Vista LISTA en CSS GRID (no <table>): permite ancho por columna y cabecera sticky.
  renderTable(visible) {
    if (visible.length === 0) return this.emptyState();
    const cols = this.visibleColumns;
    const tpl = { gridTemplateColumns: this.gridTemplate() };
    const allOn = this.selectable && visible.length > 0 && visible.every((r6) => this.selection.has(this.keyOf(r6)));
    const alignCls = (a3) => a3 === "right" ? "right" : a3 === "center" ? "center" : "left";
    return b2`
      <div class=${`scroll${this.xOverflow ? " x-overflow" : ""}`}>
        <div class="grid" role="table">
          <!-- Cabecera -->
          <div class="grow ghead" role="row" style=${o6(tpl)}>
            ${this.selectable ? b2`<span class="selcb"><ion-checkbox .checked=${allOn} aria-label=${this.t.selectAll} @ionChange=${() => this.toggleAll(visible)}></ion-checkbox></span>` : A}
            ${cols.map((c5) => {
      const sortable = this.isSortable(c5);
      const active = sortable && (this.serverSide ? this.sort === c5.key : this.clientSort === c5.key);
      const dir = this.serverSide ? this.sortDir : this.clientSortDir;
      const caretIcon = !active ? iconSwapVerticalOutline : dir === "asc" ? iconChevronUpOutline : iconChevronDownOutline;
      return b2`
                <div
                  class=${`gcell gh ${alignCls(c5.align)}${sortable ? " sortable" : ""}${c5.pinned === "end" ? " actions-col" : ""}`}
                  role="columnheader"
                  @click=${() => this.onHeaderClick(c5)}
                >
                  <span title=${c5.header || A}>${c5.header}</span>
                  ${sortable ? b2`<span class=${`caret${active ? " on" : ""}`}><ion-icon .icon=${okIcon(caretIcon)}></ion-icon></span>` : A}
                </div>
              `;
    })}
            ${this.actions.length ? b2`<div class="gcell gh right actions-col" role="columnheader">
                  <span class=${this.rowActionsCollapsed || !this.actionsLabelFits ? "sr-only" : ""}>${this.t.actions}</span>
                </div>` : A}
          </div>

          <!-- Filas -->
          ${c4(
      visible,
      (row) => this.keyOf(row),
      (row) => {
        const key = this.keyOf(row);
        const selected = this.selectable && this.selection.has(key);
        return b2`
                <div
                  class=${`grow grow-data${selected ? " selected" : ""}${this.rowClickable ? " clickable" : ""}`}
                  role="row"
                  data-testid=${this.tid(`row-${key}`)}
                  style=${o6(tpl)}
                  tabindex=${this.rowClickable ? "0" : A}
                  @click=${this.rowClickable ? () => this.emit("rowClick", { row }) : A}
                  @keydown=${this.rowClickable ? (e6) => this.onRowKeydown(e6, row) : A}
                >
                  ${this.selectable ? b2`<span class="selcb" @click=${(e6) => e6.stopPropagation()}><ion-checkbox .checked=${selected} aria-label=${this.t.selectRow} @ionChange=${() => this.toggleRow(key)}></ion-checkbox></span>` : A}
                  ${cols.map(
          (c5) => b2`<div class=${`gcell ${alignCls(c5.align)}${c5.pinned === "end" ? " actions-col" : ""}`} role="cell">${c5.render ? c5.render(row) : this.textCell(c5, row, key)}</div>`
        )}
                  ${this.actions.length ? b2`<div class="gcell right actions-col" role="cell" @click=${(e6) => e6.stopPropagation()}>${this.actionButtons(row, true)}</div>` : A}
                </div>
              `;
      }
    )}
        </div>
      </div>
      ${this.renderRowMenu()}
    `;
  }
  /** #205 — The column a card's title already shows, so the default body does not repeat it
   *  («Tarifa mayorista 1» as the title and again as «Nombre»). Decided per card: the first visible
   *  column whose cell reads exactly like the title. Only text is compared: a title given as a
   *  template, or a column with its own `render`, is never matched. */
  cardTitleColumn(title, row) {
    if (typeof title !== "string" && typeof title !== "number") return void 0;
    const text = String(title).trim();
    if (!text) return void 0;
    return this.visibleColumns.find((c5) => !c5.render && String(this.cell(c5, row) ?? "").trim() === text);
  }
  renderCards(visible) {
    if (visible.length === 0) return this.emptyState();
    const hasHead = !!this.cardTitle || !!this.cardIcon || this.selectable;
    return b2`
      <div class="cards-grid">
        ${c4(
      visible,
      (row) => this.keyOf(row),
      (row) => {
        const key = this.keyOf(row);
        const selected = this.selectable && this.selection.has(key);
        const icon = this.cardIcon?.(row);
        const title = this.cardTitle?.(row);
        const titleColumn = this.cardTitleColumn(title, row);
        return b2`
              <ion-card
                class=${`rcard${selected ? " selected" : ""}${this.rowClickable ? " clickable" : ""}`}
                data-testid=${this.tid(`row-${key}`)}
                role=${this.rowClickable ? "button" : A}
                tabindex=${this.rowClickable ? "0" : A}
                @click=${this.rowClickable ? () => this.emit("rowClick", { row }) : A}
                @keydown=${this.rowClickable ? (e6) => this.onRowKeydown(e6, row) : A}
              >
                ${hasHead ? b2`
                      <ion-card-header class="rcard-head">
                        ${icon != null && icon !== "" ? b2`<span class="rc-icon">${typeof icon === "string" ? b2`<ion-icon .icon=${okIcon(icon)}></ion-icon>` : icon}</span>` : A}
                        <span class="rc-title">${this.cardTitle ? title : A}</span>
                        ${this.selectable ? b2`<ion-checkbox .checked=${selected} aria-label=${this.t.select} @click=${(e6) => e6.stopPropagation()} @ionChange=${() => this.toggleRow(key)}></ion-checkbox>` : A}
                      </ion-card-header>
                    ` : A}
                <ion-card-content class="rcard-body">
                  ${this.renderCard ? this.renderCard(row) : this.visibleColumns.filter((c5) => c5 !== titleColumn).map(
          (c5) => b2`<div class="rrow"><span class="rk">${c5.header}</span><span class="rv">${c5.render ? c5.render(row) : this.cell(c5, row)}</span></div>`
        )}
                </ion-card-content>
                ${this.actions.length ? b2`<div class="ractions" @click=${(e6) => e6.stopPropagation()}>${this.actionButtons(row)}</div>` : A}
              </ion-card>
            `;
      }
    )}
      </div>
    `;
  }
};
__decorateClass3([
  n4({ attribute: false })
], _OkDataTable.prototype, "columns");
__decorateClass3([
  n4({ attribute: false })
], _OkDataTable.prototype, "rows");
__decorateClass3([
  n4({ attribute: false })
], _OkDataTable.prototype, "searchKeys");
__decorateClass3([
  n4({ attribute: "row-key-field" })
], _OkDataTable.prototype, "rowKeyField");
__decorateClass3([
  n4({ attribute: false })
], _OkDataTable.prototype, "rowKey");
__decorateClass3([
  n4({ type: Number, attribute: "page-size" })
], _OkDataTable.prototype, "pageSize");
__decorateClass3([
  n4({ attribute: "empty-message" })
], _OkDataTable.prototype, "emptyMessage");
__decorateClass3([
  n4({ attribute: "no-matches-message" })
], _OkDataTable.prototype, "noMatchesMessage");
__decorateClass3([
  n4({ type: String })
], _OkDataTable.prototype, "error");
__decorateClass3([
  n4({ attribute: "search-placeholder" })
], _OkDataTable.prototype, "searchPlaceholder");
__decorateClass3([
  n4({ attribute: false })
], _OkDataTable.prototype, "labels");
__decorateClass3([
  n4({ attribute: false })
], _OkDataTable.prototype, "actions");
__decorateClass3([
  n4({ type: Boolean })
], _OkDataTable.prototype, "addable");
__decorateClass3([
  n4({ attribute: false })
], _OkDataTable.prototype, "pageSizeOptions");
__decorateClass3([
  n4({ type: Boolean, reflect: true })
], _OkDataTable.prototype, "fill");
__decorateClass3([
  n4({ type: Boolean, attribute: "column-picker" })
], _OkDataTable.prototype, "columnPicker");
__decorateClass3([
  n4({ type: Boolean })
], _OkDataTable.prototype, "csv");
__decorateClass3([
  n4({ attribute: "csv-name" })
], _OkDataTable.prototype, "csvName");
__decorateClass3([
  n4({ type: Boolean, attribute: "server-side" })
], _OkDataTable.prototype, "serverSide");
__decorateClass3([
  n4({ type: Number })
], _OkDataTable.prototype, "total");
__decorateClass3([
  n4({ type: Number })
], _OkDataTable.prototype, "page");
__decorateClass3([
  n4({ type: Boolean })
], _OkDataTable.prototype, "searchable");
__decorateClass3([
  n4({ type: String })
], _OkDataTable.prototype, "search");
__decorateClass3([
  n4({ type: String })
], _OkDataTable.prototype, "sort");
__decorateClass3([
  n4({ attribute: "sort-dir" })
], _OkDataTable.prototype, "sortDir");
__decorateClass3([
  n4({ attribute: false })
], _OkDataTable.prototype, "filterValues");
__decorateClass3([
  n4()
], _OkDataTable.prototype, "title");
__decorateClass3([
  n4({ attribute: false })
], _OkDataTable.prototype, "views");
__decorateClass3([
  n4({ attribute: "default-view" })
], _OkDataTable.prototype, "defaultView");
__decorateClass3([
  n4({ type: Boolean })
], _OkDataTable.prototype, "exportable");
__decorateClass3([
  n4({ type: Boolean })
], _OkDataTable.prototype, "importable");
__decorateClass3([
  n4({ type: Boolean, attribute: "column-selector" })
], _OkDataTable.prototype, "columnSelector");
__decorateClass3([
  n4({ attribute: false })
], _OkDataTable.prototype, "pageSizes");
__decorateClass3([
  n4({ type: Boolean, attribute: "row-clickable" })
], _OkDataTable.prototype, "rowClickable");
__decorateClass3([
  n4({ type: Boolean })
], _OkDataTable.prototype, "selectable");
__decorateClass3([
  n4({ attribute: false })
], _OkDataTable.prototype, "selectedKeys");
__decorateClass3([
  n4({ attribute: false })
], _OkDataTable.prototype, "primaryAction");
__decorateClass3([
  n4({ type: Boolean })
], _OkDataTable.prototype, "inlineFilters");
__decorateClass3([
  n4({ attribute: false })
], _OkDataTable.prototype, "menuActions");
__decorateClass3([
  n4({ attribute: false })
], _OkDataTable.prototype, "cardTitle");
__decorateClass3([
  n4({ attribute: false })
], _OkDataTable.prototype, "cardIcon");
__decorateClass3([
  n4({ attribute: false })
], _OkDataTable.prototype, "renderCard");
__decorateClass3([
  n4({ type: String })
], _OkDataTable.prototype, "testid");
__decorateClass3([
  r5()
], _OkDataTable.prototype, "q");
__decorateClass3([
  r5()
], _OkDataTable.prototype, "clientPage");
__decorateClass3([
  r5()
], _OkDataTable.prototype, "clientPageSize");
__decorateClass3([
  r5()
], _OkDataTable.prototype, "mobileShown");
__decorateClass3([
  r5()
], _OkDataTable.prototype, "clientSort");
__decorateClass3([
  r5()
], _OkDataTable.prototype, "clientSortDir");
__decorateClass3([
  r5()
], _OkDataTable.prototype, "clientFilters");
__decorateClass3([
  r5()
], _OkDataTable.prototype, "filterDraft");
__decorateClass3([
  r5()
], _OkDataTable.prototype, "serverFilters");
__decorateClass3([
  r5()
], _OkDataTable.prototype, "panel");
__decorateClass3([
  r5()
], _OkDataTable.prototype, "panelTitle");
__decorateClass3([
  r5()
], _OkDataTable.prototype, "viewMode");
__decorateClass3([
  r5()
], _OkDataTable.prototype, "isMobile");
__decorateClass3([
  r5()
], _OkDataTable.prototype, "xOverflow");
__decorateClass3([
  r5()
], _OkDataTable.prototype, "actionsTrackPx");
__decorateClass3([
  r5()
], _OkDataTable.prototype, "rowActionsCollapsed");
__decorateClass3([
  r5()
], _OkDataTable.prototype, "actionsLabelFits");
__decorateClass3([
  r5()
], _OkDataTable.prototype, "unfoldedCells");
__decorateClass3([
  r5()
], _OkDataTable.prototype, "rowMenuOpen");
__decorateClass3([
  r5()
], _OkDataTable.prototype, "columnChoice");
__decorateClass3([
  r5()
], _OkDataTable.prototype, "internalSelection");
__decorateClass3([
  r5()
], _OkDataTable.prototype, "menuOpen");
var OkDataTable = _OkDataTable;
define("ok-data-table", OkDataTable);

// @erplora/module-sdk/src/quantity.ts
var QUANTITY_SCALE = 1e6;
function toMicro(quantity) {
  return Math.round(quantity * QUANTITY_SCALE);
}

// @erplora/module-sdk/src/index.ts
function dataTableShowsLoadError() {
  const registry = globalThis.customElements;
  const table = registry?.get("ok-data-table");
  return !!table && "error" in table.prototype;
}
function isEmpty(v3) {
  return v3 === null || v3 === void 0 || v3 === "";
}
var ListController = class {
  constructor(client, queryName, onChange = () => {
  }, opts = {}) {
    this.client = client;
    this.queryName = queryName;
    this.onChange = onChange;
    this.rows = [];
    this.total = 0;
    this.loading = false;
    this.error = "";
    /** Descarta respuestas obsoletas si llegan fuera de orden (race de cargas concurrentes). */
    this.seq = 0;
    this.state = {
      page: 0,
      pageSize: opts.pageSize ?? 50,
      search: "",
      sort: opts.sort,
      dir: opts.dir ?? "asc",
      filters: { ...opts.filters ?? {} },
      context: { ...opts.context ?? {} }
    };
    this.moneyFilters = new Set(opts.moneyFilters ?? []);
    this.quantityFilters = new Set(opts.quantityFilters ?? []);
    if (this.moneyFilters.size > 0 && typeof client.currencyDecimals !== "number") {
      throw new ErploraError(
        "list_money_filters_need_currency_decimals",
        "moneyFilters needs a list client that exposes currencyDecimals"
      );
    }
  }
  /**
   * The filters as the runtime compares them: money and quantity columns scaled from what the
   * person typed to the stored integer. `state.filters` stays as typed, so a table that echoes it
   * back keeps showing «12», not «1200».
   */
  wireFilters() {
    if (this.moneyFilters.size === 0 && this.quantityFilters.size === 0) return this.state.filters;
    const decimals2 = this.client.currencyDecimals ?? 0;
    const out = {};
    for (const [col, value] of Object.entries(this.state.filters)) {
      const scale = this.moneyFilters.has(col) ? (n6) => majorToMinor(n6, decimals2) : this.quantityFilters.has(col) ? toMicro : null;
      out[col] = scale ? scaleFilterValue(value, scale) : value;
    }
    return out;
  }
  /** Nº de páginas según el total del servidor (mínimo 1). */
  get pageCount() {
    return Math.max(1, Math.ceil(this.total / this.state.pageSize));
  }
  /**
   * (Re)loads the current page from the server. On a phone, after «Load more» (hub#2365), the
   * current page is everything shown so far: a refresh brings back pages 0..page in one request.
   */
  async load() {
    const s5 = this.state;
    const mySeq = ++this.seq;
    const paging = mobilePagingOf(this);
    const window2 = nextListWindow(paging, s5);
    this.loading = true;
    this.error = "";
    this.onChange();
    try {
      const page = await this.client.queryPage(this.queryName, {
        limit: window2.limit,
        offset: window2.offset,
        search: s5.search,
        sort: s5.sort,
        dir: s5.dir,
        filters: this.wireFilters(),
        params: s5.context
      });
      if (mySeq !== this.seq) return;
      const rows = page.rows ?? [];
      this.rows = window2.append ? [...this.rows, ...rows] : rows;
      this.total = page.total ?? this.rows.length;
      if (window2.growsTo !== void 0) {
        s5.page = window2.growsTo;
        keepAccumulating(paging, () => void this.load());
      }
    } catch (e6) {
      if (mySeq !== this.seq) return;
      this.rows = [];
      this.total = 0;
      const reason = e6 instanceof Error ? e6.message.trim() : "";
      this.error = reason || listLoadFailedMessage(activeLocale());
    } finally {
      if (mySeq === this.seq) {
        this.loading = false;
        this.onChange();
      }
    }
  }
  /**
   * Goes to `page`. On a phone `<ok-data-table>` has no pager, only «Load more», which asks for
   * `page + 1`: that one is ADDED under the rows already shown (hub#2365). Any other jump replaces.
   */
  setPage(page) {
    const next = Math.max(0, page);
    const paging = mobilePagingOf(this);
    if (next === this.state.page + 1 && phoneViewport()?.matches) {
      paging.growNext = true;
    } else {
      stopAccumulating(paging);
      this.state.page = next;
    }
    void this.load();
  }
  setSort(sort, dir) {
    this.state.sort = sort;
    this.state.dir = dir;
    this.state.page = 0;
    void this.load();
  }
  setSearch(search) {
    this.state.search = search;
    this.state.page = 0;
    void this.load();
  }
  /** Cambia el nº de filas por página y recarga desde la página 0. */
  setPageSize(pageSize) {
    this.state.pageSize = Math.max(1, pageSize);
    this.state.page = 0;
    void this.load();
  }
  /** Aplica/quita un filtro de columna; valores vacíos lo eliminan. Vuelve a la página 0. */
  setFilter(col, value) {
    if (isEmpty(value)) {
      delete this.state.filters[col];
    } else if (typeof value === "object" && value !== null) {
      const prev = this.state.filters[col] ?? {};
      const merged = { ...prev, ...value };
      const cleaned = Object.fromEntries(Object.entries(merged).filter(([, v3]) => !isEmpty(v3)));
      if (Object.keys(cleaned).length === 0) delete this.state.filters[col];
      else this.state.filters[col] = cleaned;
    } else {
      this.state.filters[col] = value;
    }
    this.state.page = 0;
    void this.load();
  }
  /** Fija/actualiza los params de contexto obligatorios (p.ej. al seleccionar el padre).
   *  Vuelve a la página 0 y recarga. Pasa `{}` o keys con valor vacío para limpiar. */
  setContext(context) {
    this.state.context = { ...context };
    this.state.page = 0;
    void this.load();
  }
  reset() {
    this.state.page = 0;
    this.state.search = "";
    this.state.filters = {};
    void this.load();
  }
};
var PHONE_MEDIA = "(max-width: 640px)";
function phoneViewport() {
  const matchMedia = globalThis.matchMedia;
  return typeof matchMedia === "function" ? matchMedia(PHONE_MEDIA) : null;
}
var mobilePaging = /* @__PURE__ */ new WeakMap();
function mobilePagingOf(ctrl) {
  let paging = mobilePaging.get(ctrl);
  if (!paging) {
    paging = { accumulated: false, growNext: false };
    mobilePaging.set(ctrl, paging);
  }
  return paging;
}
function nextListWindow(paging, s5) {
  const size = s5.pageSize;
  const grow = paging.growNext;
  paging.growNext = false;
  if (grow) {
    const target = s5.page + 1;
    if (paging.accumulated || s5.page === 0) {
      return { offset: target * size, limit: size, append: true, growsTo: target };
    }
    return { offset: 0, limit: (target + 1) * size, append: false, growsTo: target };
  }
  if (s5.page === 0) stopAccumulating(paging);
  if (paging.accumulated) return { offset: 0, limit: (s5.page + 1) * size, append: false };
  return { offset: s5.page * size, limit: size, append: false };
}
function keepAccumulating(paging, reload) {
  paging.accumulated = true;
  if (paging.unwatch) return;
  const viewport = phoneViewport();
  if (!viewport?.addEventListener) return;
  const onChange = (e6) => {
    if (e6.matches) return;
    stopAccumulating(paging);
    reload();
  };
  viewport.addEventListener("change", onChange);
  paging.unwatch = () => viewport.removeEventListener?.("change", onChange);
}
function stopAccumulating(paging) {
  paging.accumulated = false;
  paging.unwatch?.();
  paging.unwatch = void 0;
}
function scaleFilterEdge(edge, scale) {
  const text = typeof edge === "string" ? edge.trim().replace(",", ".") : edge;
  if (text === "" || text === null || text === void 0) return "";
  const n6 = Number(text);
  return Number.isFinite(n6) ? scale(n6) : "";
}
function scaleFilterValue(value, scale) {
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([edge, v3]) => [edge, scaleFilterEdge(v3, scale)])
    );
  }
  return scaleFilterEdge(value, scale);
}
var LIST_LOAD_FAILED_EN = "The hub did not return the data.";
var LIST_LOAD_FAILED_ES = "El hub no ha devuelto los datos.";
function listLoadFailedMessage(locale) {
  return locale.toLowerCase().startsWith("en") ? LIST_LOAD_FAILED_EN : LIST_LOAD_FAILED_ES;
}
function createListController(client, queryName, onChange = () => {
}, opts = {}) {
  return new ListController(client, queryName, onChange, opts);
}
var ErploraError = class extends Error {
  constructor(code, message, permission, fields) {
    super(message);
    this.code = code;
    this.permission = permission;
    this.fields = fields;
    this.name = "ErploraError";
  }
};
function activeLocale() {
  try {
    return localStorage.getItem("erplora.locale") || "es";
  } catch {
    return "es";
  }
}
function majorToMinor(amount, decimals2) {
  const n6 = Number(amount);
  return Number.isFinite(n6) ? Math.round(n6 * 10 ** decimals2) : 0;
}
function minorToMajor(amount, decimals2) {
  return (amount ?? 0) / 10 ** decimals2;
}

// @erplora/module-services/locales/es.json
var es_default = {
  name: "Servicios",
  description: "Cat\xE1logo de servicios con categor\xEDas y bonos, y su disponibilidad.",
  setup: {
    title: "Tu cat\xE1logo de servicios",
    description: "A\xF1ade los servicios que vendes, con su precio y su duraci\xF3n."
  },
  navigation: {
    services: {
      label: "Servicios"
    },
    categories: {
      label: "Categor\xEDas"
    },
    packages: {
      label: "Bonos y paquetes"
    }
  },
  settings: {
    title: "Servicios",
    fields: {
      default_duration: {
        label: "Duraci\xF3n por defecto (min)"
      },
      default_buffer_time: {
        label: "Tiempo de margen por defecto (min)"
      },
      default_tax_category_key: {
        label: "Tipo de IVA por defecto"
      },
      show_prices: {
        label: "Mostrar precios"
      },
      show_duration: {
        label: "Mostrar duraci\xF3n"
      },
      allow_online_booking: {
        label: "Permitir reserva online"
      },
      include_tax_in_price: {
        label: "Precios con IVA incluido"
      },
      currency: {
        label: "Moneda"
      }
    }
  },
  ui: {
    title: "Servicios",
    colName: "Nombre",
    colCategory: "Categor\xEDa",
    colPricingType: "Tarifa",
    pricingType: {
      fixed: "Precio fijo",
      hourly: "Por hora",
      from: "Desde",
      variable: "Variable",
      free: "Gratis"
    },
    colPrice: "Precio",
    colDuration: "Duraci\xF3n (min)",
    colStatus: "Estado",
    status: {
      active: "Activo",
      inactive: "Archivado",
      unconfigured: "Sin configurar"
    },
    statusReason: {
      unconfigured: "Sin categor\xEDa fiscal: no se puede cobrar"
    },
    placeholderName: "Nombre",
    placeholderPrice: "Precio",
    placeholderDuration: "Duraci\xF3n (min)",
    optionNoCategory: "Sin categor\xEDa",
    colTax: "Categor\xEDa fiscal",
    taxGroup: "grupo",
    taxCategoriesMissing: "Todav\xEDa no hay categor\xEDas fiscales. Config\xFAralas en Impuestos antes de a\xF1adir servicios.",
    btnSaving: "Guardando\u2026",
    btnAdd: "A\xF1adir",
    searchPlaceholder: "Buscar servicio\u2026",
    loading: "Cargando\u2026",
    empty: "Sin servicios.",
    errorCreate: "No se pudo crear el servicio",
    errorTaxRequired: "Elige una categor\xEDa fiscal: sin ella el servicio no se puede cobrar",
    actionArchive: "Archivar",
    archiveTitle: "Archivar servicio",
    archiveHint: "dejar\xE1 de ofrecerse y de poder reservarse. Se conservan su hist\xF3rico y las citas ya reservadas.",
    archiveWarnAppointments: "{count} cita(s) pr\xF3xima(s) siguen usando este servicio. Conservan su reserva, precio y duraci\xF3n; solo dejan de admitirse reservas nuevas.",
    archiveConfirm: "Archivar",
    btnCancel: "Cancelar",
    errorArchive: "No se pudo archivar el servicio",
    actionRestore: "Restaurar",
    errorRestore: "No se pudo restaurar el servicio",
    actionEdit: "Editar",
    editingTitle: "Editando servicio",
    editingCancel: "Cancelar edici\xF3n",
    btnSave: "Guardar cambios",
    errorUpdate: "No se pudo actualizar el servicio",
    colParent: "Categor\xEDa padre",
    colSortOrder: "Orden",
    colServiceCount: "Servicios",
    placeholderParent: "Padre\u2026",
    optionNoParent: "Sin padre (ra\xEDz)",
    searchCategoryPlaceholder: "Buscar categor\xEDa\u2026",
    emptyCategories: "No hay categor\xEDas.",
    editingCategoryTitle: "Editando categor\xEDa",
    deleteCategoryTitle: "Eliminar categor\xEDa",
    deleteCategoryHint: "la categor\xEDa desaparece; los servicios que contiene se conservan, sin categor\xEDa.",
    deleteCategoryImpact: "{count} servicio(s) se quedar\xE1n sin categor\xEDa.",
    errorSaveCategory: "No se pudo guardar la categor\xEDa",
    errorDeleteCategory: "No se pudo eliminar la categor\xEDa",
    actionDelete: "Eliminar",
    colDiscount: "Descuento",
    colFixedPrice: "Precio cerrado",
    colItems: "L\xEDneas",
    colDiscountType: "Tipo de descuento",
    discountType: {
      percentage: "Porcentaje",
      fixed: "Importe fijo"
    },
    colDiscountAmount: "Descuento (importe)",
    colDiscountPercent: "Descuento (%)",
    fixedPriceHelp: "D\xE9jalo vac\xEDo para que valga la suma de sus l\xEDneas menos el descuento.",
    colValidityDays: "Vigencia (d\xEDas)",
    validityHelp: "D\xEDas canjeable desde la COMPRA; vac\xEDo = no caduca.",
    colMaxUses: "Usos",
    maxUsesHelp: "Usos que concede el bono; vac\xEDo = ilimitados.",
    packageLinesTitle: "Servicios incluidos",
    colService: "Servicio",
    colSessions: "Sesiones",
    addLine: "A\xF1adir servicio",
    removeLine: "Quitar l\xEDnea",
    packageLinesFixed: "Los servicios incluidos no se cambian una vez creado: archiva este paquete y crea uno nuevo.",
    searchPackagePlaceholder: "Buscar paquete\u2026",
    emptyPackages: "No hay paquetes.",
    editingPackageTitle: "Editando paquete",
    deletePackageTitle: "Eliminar paquete",
    deletePackageHint: "el paquete y sus {count} l\xEDnea(s) desaparecen del cat\xE1logo; los bonos ya vendidos conservan su saldo.",
    errorPackageNoLines: "A\xF1ade al menos un servicio: un paquete sin l\xEDneas no se puede canjear.",
    errorSavePackage: "No se pudo guardar el paquete",
    errorDeletePackage: "No se pudo eliminar el paquete",
    tender: {
      title: "Pagar esta l\xEDnea con un bono",
      candidates: "{count} bonos v\xE1lidos",
      remainingAfter: "Quedan {before} sesiones \xB7 {after} despu\xE9s de esta",
      unlimited: "Sesiones ilimitadas",
      expires: "Caduca el {date}",
      none: "Este cliente no tiene ning\xFAn bono que cubra este servicio.",
      loadFailed: "No se han podido cargar los bonos del cliente. Int\xE9ntalo otra vez antes de cobrar el precio completo.",
      holdFailed: "No se ha podido reservar la sesi\xF3n de ese bono.",
      releaseFailed: "No se ha podido devolver la sesi\xF3n de ese bono.",
      held: "{name}: sesi\xF3n gastada. Quedan {after}.",
      heldUnlimited: "{name}: sesi\xF3n gastada.",
      btnConfirm: "Gastar una sesi\xF3n",
      btnHolding: "Reservando\u2026",
      btnUndo: "Deshacer",
      btnRetry: "Reintentar",
      reason: {
        only_option: "Es el \xFAnico bono que cubre este servicio.",
        finite_before_unlimited: "Se gasta primero porque tiene un n\xFAmero limitado de sesiones.",
        expires_first: "Se gasta primero porque es el que antes caduca.",
        already_started: "Se gasta primero para terminar el bono que ya estaba empezado.",
        fewest_sessions_left: "Se gasta primero porque es al que le quedan menos sesiones.",
        oldest_voucher: "Se gasta primero porque se compr\xF3 antes.",
        stable_order: "Los dos bonos son equivalentes; este va siempre primero.",
        generic: "Este es el bono que se va a gastar."
      }
    },
    sessionRefund: {
      title: "Sesi\xF3n de bono",
      giveBack: "Devolver la sesi\xF3n a {name}",
      remainingAfter: "Quedan {before} sesiones \xB7 {after} tras esta devoluci\xF3n",
      unlimited: "Sesiones ilimitadas",
      expired: "{name} caduc\xF3 el {date}. La sesi\xF3n vuelve al bono igualmente.",
      done: "{name}: la sesi\xF3n ha vuelto al bono.",
      loadFailed: "No se han podido leer las sesiones de bono de esta venta. Int\xE9ntalo otra vez antes de terminar la devoluci\xF3n.",
      refundFailed: "No se ha podido devolver esa sesi\xF3n al bono.",
      btnRetry: "Reintentar",
      reason: {
        already_refunded: "Esta sesi\xF3n ya se devolvi\xF3 en otra devoluci\xF3n.",
        not_settled: "Esta sesi\xF3n nunca se cobr\xF3, as\xED que no hay nada que devolver.",
        generic: "Esta sesi\xF3n no se puede devolver."
      }
    },
    actionMovements: "Movimientos",
    movementsTitle: "Movimientos del bono",
    movementsHint: "todas las sesiones de este bono: reservadas, entregadas, liberadas, caducadas y devueltas, y las cortes\xEDas regaladas y las correcciones hechas despu\xE9s.",
    movementsMore: "Cargar m\xE1s",
    movementsCount: "Se muestran {shown} de {total}",
    movementCustomer: "Cliente",
    movementSale: "Venta",
    movementNoService: "Sin servicio en la l\xEDnea",
    movementRefundedBy: "Devuelta por {who} el {when}",
    movementRefundDoc: "Devoluci\xF3n",
    movementRefundedExpired: "La sesi\xF3n ha vuelto a un bono que ya estaba caducado: consta en el bono, pero no se puede gastar mientras el bono no vuelva a estar vigente.",
    emptyMovements: "Este bono a\xFAn no se ha usado.",
    errorMovements: "No se han podido cargar los movimientos",
    btnClose: "Cerrar",
    movement: {
      held: "Reservada",
      consumed: "Entregada",
      released: "Liberada",
      refunded: "Devuelta",
      expired: "Caducada",
      adjusted: "Cortes\xEDa",
      corrected: "Correcci\xF3n"
    },
    openOrphans: "Bonos sin cliente",
    orphansTitle: "Bonos sin cliente",
    orphansHint: "Se borr\xF3 o se anonimiz\xF3 su ficha de cliente. El bono conserva todo lo que se vendi\xF3 \u2014 devu\xE9lvelo o p\xE1salo a otra ficha.",
    emptyOrphans: "Ning\xFAn bono se ha quedado sin cliente.",
    errorOrphans: "No se han podido cargar los bonos sin cliente.",
    orphanRemaining: "Quedan {remaining} sesi\xF3n(es)",
    orphanNoValue: "Agotado",
    orphanDeletedAt: "Cliente borrado el {when}",
    orphanExpired: "Caducado",
    orphanCustomerRef: "Referencia del cliente",
    orphansCount: "{shown} de {total}",
    orphansMore: "Cargar m\xE1s",
    actionGrants: "Bonos vendidos",
    grantsTitle: "Bonos vendidos",
    grantsHint: "todos los clientes que han comprado este bono, con las sesiones usadas y las que quedan. A un bono vivo se le pueden regalar sesiones o alargar la caducidad, o quitar sesiones para corregir su saldo; una venta de la que no se ha usado nada se puede anular.",
    emptyGrants: "Nadie ha comprado este bono todav\xEDa.",
    errorGrants: "No se han podido cargar los bonos vendidos",
    grantsCount: "Se muestran {shown} de {total}",
    grantsMore: "Cargar m\xE1s",
    grantStatus: {
      active: "Activo",
      voided: "Anulado"
    },
    grantUses: "{used} usadas \xB7 quedan {remaining}",
    grantUsesUnlimited: "{used} usadas \xB7 sin l\xEDmite",
    grantVoidedBy: "Anulado por {who} el {when}",
    actionVoidGrant: "Anular",
    btnVoiding: "Anulando\u2026",
    voidGrantTitle: "\xBFAnular este bono?",
    voidGrantHint: "El bono del cliente {customer} ({amount}) deja de poder usarse y queda en la lista como anulado. El dinero no se devuelve aqu\xED: si se cobr\xF3, devuelve la venta desde Ventas con una devoluci\xF3n.",
    voidReasonLabel: "Motivo",
    voidReasonHelp: "Obligatorio. Queda en el registro del bono, p. ej. \xABvendido al cliente equivocado\xBB.",
    errorVoidGrant: "No se ha podido anular el bono",
    nameLoading: "Cargando nombre\u2026",
    grantExpires: "Caduca el {when}",
    grantNoExpiry: "No caduca",
    grantAdjusted: "Regalado despu\xE9s: +{uses} sesi\xF3n(es), +{days} d\xEDa(s)",
    actionAdjustGrant: "Ajustar",
    adjustGrantTitle: "Ajustar este bono",
    adjustGrantHint: "Regala al cliente {customer} sesiones extra o alarga la caducidad sin cobrar, o qu\xEDtale sesiones para corregir el saldo. Queda en los movimientos del bono con qui\xE9n, cu\xE1ndo y por qu\xE9.",
    adjustUsesLabel: "Sesiones que se a\xF1aden",
    adjustUsesHelp: "Quedan {remaining}. Hasta 100.",
    adjustDaysLabel: "D\xEDas que se alarga",
    adjustDaysHelp: "Ahora caduca el {when}. Hasta 366.",
    adjustReasonHelp: "Obligatorio. Queda en el registro del bono, p. ej. \xABcerramos en agosto\xBB.",
    adjustPreview: "Tras el ajuste: quedan {remaining} sesi\xF3n(es) \xB7 caduca el {when}",
    adjustPreviewUnlimited: "sin l\xEDmite de",
    errorAdjustGrant: "No se pudo ajustar el bono",
    movementAdjusted: "+{uses} sesi\xF3n(es) \xB7 +{days} d\xEDa(s)",
    movementAdjustedBy: "Regalado por {who}",
    grantCorrected: "Corregido despu\xE9s: \u2212{uses} sesi\xF3n(es), +{days} d\xEDa(s)",
    adjustAddSessions: "A\xF1adir sesiones",
    adjustRemoveSessions: "Quitar sesiones",
    adjustRemoveUsesLabel: "Sesiones que se quitan",
    adjustRemoveUsesHelp: "Quedan {remaining}. Puedes quitar hasta {remaining}.",
    movementCorrected: "\u2212{uses} sesi\xF3n(es) \xB7 +{days} d\xEDa(s)",
    movementCorrectedBy: "Corregido por {who}",
    errNotAnAmount: "Esto no es un importe. Escribe una cifra, por ejemplo 12,50.",
    errAmbiguousAmount: "Este importe se puede leer de dos maneras: \xAB{typed}\xBB tanto puede ser {grouped} como {decimal}. Escribe los decimales para que no haya duda.",
    errNegativeAmount: "Este importe no puede ser negativo."
  },
  errors: {
    "services.category_unavailable": "Esa categor\xEDa no est\xE1 disponible: no existe en este negocio o se ha eliminado.",
    "services.service_update_rejected": "No se ha podido actualizar el servicio: no existe en este negocio, o la categor\xEDa elegida no existe.",
    "services.service_not_found": "Ese servicio no existe en este negocio.",
    "services.service_not_archived": "No se ha podido recuperar el servicio: no existe en este negocio, o ya se est\xE1 ofreciendo.",
    "services.parent_category_unavailable": "Esa categor\xEDa padre no est\xE1 disponible: no existe en este negocio o se ha eliminado.",
    "services.category_update_rejected": "No se ha podido actualizar la categor\xEDa: no existe en este negocio, o la categor\xEDa padre elegida no existe (o es ella misma).",
    "services.category_name_taken": "Ya hay una categor\xEDa con ese nombre. Elige otro nombre.",
    "services.category_not_found": "Esa categor\xEDa no existe en este negocio.",
    "services.package_not_found": "Ese paquete no existe en este negocio.",
    "services.package_no_grant": "Este cliente no tiene ese bono: nadie se lo ha vendido.",
    "services.grant_customer_required": "Elige el cliente al que pertenece el bono: un bono sin due\xF1o no lo puede canjear nadie.",
    "services.package_needs_lines": "Un paquete necesita al menos una l\xEDnea de servicio: un paquete sin l\xEDneas no se puede vender ni canjear.",
    "services.package_no_uses_left": "Este bono ya no tiene sesiones disponibles.",
    "services.package_expired": "Este bono ha caducado.",
    "services.package_voided": "Este bono est\xE1 anulado: ya no se puede usar.",
    "services.package_not_redeemable": "Este bono no se puede canjear ahora mismo.",
    "services.package_does_not_cover_service": "Este bono no cubre ese servicio. Un bono de cortes paga cortes, no el champ\xFA.",
    "services.hold_not_releasable": "Esa sesi\xF3n del bono ya no se puede devolver: la venta est\xE1 cobrada. Devolverla es una devoluci\xF3n, y va por su propia puerta.",
    "services.hold_not_settleable": "Esa sesi\xF3n del bono no se ha podido liquidar: no existe aqu\xED, ya se devolvi\xF3, o ya estaba liquidada.",
    "services.redemption_not_found": "Esa sesi\xF3n del bono no existe en este negocio.",
    "services.redemption_not_settled": "Esa sesi\xF3n del bono nunca se cobr\xF3, as\xED que no hay nada que devolver. Lo que procede es liberar la reserva.",
    "services.redemption_already_refunded": "Esa sesi\xF3n del bono ya se devolvi\xF3 en otra devoluci\xF3n.",
    "services.redemption_not_refundable": "Esa sesi\xF3n del bono no se puede devolver ahora mismo.",
    "services.grant_not_found": "Esa venta de bono no existe en este negocio.",
    "services.grant_already_voided": "Ese bono ya estaba anulado.",
    "services.grant_in_use": "Ese bono ya se ha usado: no se puede anular.",
    "services.grant_void_reason_required": "Indica por qu\xE9 se anula este bono: el motivo queda en su registro.",
    "services.grant_not_voidable": "Ese bono no se puede anular ahora: se ha usado o anulado mientras tanto. Recarga la lista y vuelve a intentarlo.",
    "services.grant_adjust_reason_required": "Indica por qu\xE9 se ajusta este bono: el motivo queda en su registro.",
    "services.grant_adjust_invalid": "Las sesiones tienen que ser un n\xFAmero entero hasta 100 (para a\xF1adir o para quitar), y los d\xEDas, de 0 a 366.",
    "services.grant_adjust_empty": "A\xF1ade o quita al menos una sesi\xF3n, o a\xF1ade al menos un d\xEDa.",
    "services.grant_unlimited": "Ese bono no tiene l\xEDmite de sesiones: no hay sesiones que a\xF1adir ni quitar.",
    "services.grant_no_expiry": "Ese bono no caduca: no hay caducidad que alargar.",
    "services.grant_not_adjustable": "Ese bono no se puede ajustar ahora: se ha anulado, o se han usado sus sesiones, mientras tanto. Recarga la lista y vuelve a intentarlo.",
    "services.grant_adjust_below_used": "No puedes quitar m\xE1s sesiones de las que le quedan al cliente."
  }
};

// @erplora/module-services/locales/en.json
var en_default = {
  name: "Services",
  setup: {
    title: "Your service catalogue",
    description: "Add the services you sell, with their price and duration."
  },
  navigation: {
    services: {
      label: "Services"
    },
    categories: {
      label: "Categories"
    },
    packages: {
      label: "Packages"
    }
  },
  settings: {
    title: "Services",
    fields: {
      default_duration: {
        label: "Default duration (min)"
      },
      default_buffer_time: {
        label: "Default buffer time (min)"
      },
      default_tax_category_key: {
        label: "Default VAT rate"
      },
      show_prices: {
        label: "Show prices"
      },
      show_duration: {
        label: "Show duration"
      },
      allow_online_booking: {
        label: "Allow online booking"
      },
      include_tax_in_price: {
        label: "Prices include VAT"
      },
      currency: {
        label: "Currency"
      }
    }
  },
  ui: {
    title: "Services",
    colName: "Name",
    colCategory: "Category",
    colPricingType: "Pricing",
    pricingType: {
      fixed: "Fixed price",
      hourly: "Hourly",
      from: "From",
      variable: "Variable",
      free: "Free"
    },
    colPrice: "Price",
    colDuration: "Duration (min)",
    colStatus: "Status",
    status: {
      active: "Active",
      inactive: "Archived",
      unconfigured: "Not configured"
    },
    statusReason: {
      unconfigured: "No tax category: it cannot be charged"
    },
    placeholderName: "Name",
    placeholderPrice: "Price",
    placeholderDuration: "Duration (min)",
    optionNoCategory: "No category",
    colTax: "Tax category",
    taxGroup: "group",
    taxCategoriesMissing: "There are no tax categories yet. Set them up in Taxes before adding services.",
    btnSaving: "Saving\u2026",
    btnAdd: "Add",
    searchPlaceholder: "Search service\u2026",
    loading: "Loading\u2026",
    empty: "No services.",
    errorCreate: "Could not create the service",
    errorTaxRequired: "Pick a tax category: without one the service cannot be charged",
    actionArchive: "Archive",
    archiveTitle: "Archive service",
    archiveHint: "it will no longer be offered or bookable. Its history and the appointments already booked are kept.",
    archiveWarnAppointments: "{count} upcoming appointment(s) still use this service. They keep their booking, price and duration; only new bookings stop.",
    archiveConfirm: "Archive",
    btnCancel: "Cancel",
    errorArchive: "Could not archive the service",
    actionRestore: "Restore",
    errorRestore: "Could not restore the service",
    actionEdit: "Edit",
    editingTitle: "Editing service",
    editingCancel: "Cancel edit",
    btnSave: "Save changes",
    errorUpdate: "Could not update the service",
    colParent: "Parent category",
    colSortOrder: "Order",
    colServiceCount: "Services",
    placeholderParent: "Parent\u2026",
    optionNoParent: "No parent (root)",
    searchCategoryPlaceholder: "Search category\u2026",
    emptyCategories: "No categories.",
    editingCategoryTitle: "Editing category",
    deleteCategoryTitle: "Delete category",
    deleteCategoryHint: "the category disappears; the services in it are kept, without a category.",
    deleteCategoryImpact: "{count} service(s) will be left without a category.",
    errorSaveCategory: "Could not save the category",
    errorDeleteCategory: "Could not delete the category",
    actionDelete: "Delete",
    colDiscount: "Discount",
    colFixedPrice: "Closed price",
    colItems: "Lines",
    colDiscountType: "Discount type",
    discountType: {
      percentage: "Percentage",
      fixed: "Fixed amount"
    },
    colDiscountAmount: "Discount (amount)",
    colDiscountPercent: "Discount (%)",
    fixedPriceHelp: "Leave empty to price it as the sum of its lines minus the discount.",
    colValidityDays: "Validity (days)",
    validityHelp: "Days redeemable from the PURCHASE; empty = never expires.",
    colMaxUses: "Uses",
    maxUsesHelp: "Uses the voucher grants; empty = unlimited.",
    packageLinesTitle: "Services included",
    colService: "Service",
    colSessions: "Sessions",
    addLine: "Add service",
    removeLine: "Remove line",
    packageLinesFixed: "The services included cannot be changed once created: archive this package and create a new one.",
    searchPackagePlaceholder: "Search package\u2026",
    emptyPackages: "No packages.",
    editingPackageTitle: "Editing package",
    deletePackageTitle: "Delete package",
    deletePackageHint: "the package and its {count} line(s) disappear from the catalogue; vouchers already sold keep their balance.",
    errorPackageNoLines: "Add at least one service: a package with no lines cannot be redeemed.",
    errorSavePackage: "Could not save the package",
    errorDeletePackage: "Could not delete the package",
    tender: {
      title: "Pay this line with a voucher",
      candidates: "{count} valid vouchers",
      remainingAfter: "{before} sessions left \xB7 {after} after this one",
      unlimited: "Unlimited sessions",
      expires: "Expires {date}",
      none: "This customer has no voucher that covers this service.",
      loadFailed: "The customer's vouchers could not be loaded. Try again before charging full price.",
      holdFailed: "That voucher session could not be reserved.",
      releaseFailed: "That voucher session could not be given back.",
      held: "{name}: session used. {after} left.",
      heldUnlimited: "{name}: session used.",
      btnConfirm: "Use one session",
      btnHolding: "Reserving\u2026",
      btnUndo: "Undo",
      btnRetry: "Try again",
      reason: {
        only_option: "The only voucher that covers this service.",
        finite_before_unlimited: "Used first because it has a limited number of sessions.",
        expires_first: "Used first because it expires soonest.",
        already_started: "Used first to finish the voucher already started.",
        fewest_sessions_left: "Used first because it has the fewest sessions left.",
        oldest_voucher: "Used first because it was bought first.",
        stable_order: "Both vouchers are equivalent; this one always goes first.",
        generic: "This is the voucher that will be used."
      }
    },
    sessionRefund: {
      title: "Voucher session",
      giveBack: "Give the session back to {name}",
      remainingAfter: "{before} sessions left \xB7 {after} after this return",
      unlimited: "Unlimited sessions",
      expired: "{name} expired on {date}. The session goes back to it anyway.",
      done: "{name}: the session is back on the voucher.",
      loadFailed: "The voucher sessions of this sale could not be read. Try again before finishing the return.",
      refundFailed: "That voucher session could not be given back.",
      btnRetry: "Try again",
      reason: {
        already_refunded: "This session was already given back on another return.",
        not_settled: "This session was never paid, so there is nothing to give back.",
        generic: "This session cannot be given back."
      }
    },
    actionMovements: "Movements",
    movementsTitle: "Voucher movements",
    movementsHint: "every session of this voucher: reserved, delivered, released, expired and given back, plus the courtesies given and the corrections made afterwards.",
    movementsMore: "Load more",
    movementsCount: "Showing {shown} of {total}",
    movementCustomer: "Customer",
    movementSale: "Sale",
    movementNoService: "No service on the line",
    movementRefundedBy: "Given back by {who} on {when}",
    movementRefundDoc: "Return",
    movementRefundedExpired: "The session went back to a voucher that had already expired: it is on the books, but it cannot be spent until the voucher is valid again.",
    emptyMovements: "This voucher has not been used yet.",
    errorMovements: "Could not load the movements",
    btnClose: "Close",
    movement: {
      held: "Reserved",
      consumed: "Delivered",
      released: "Released",
      refunded: "Given back",
      expired: "Expired",
      adjusted: "Courtesy",
      corrected: "Correction"
    },
    openOrphans: "Vouchers with no customer",
    orphansTitle: "Vouchers with no customer",
    orphansHint: "Their customer sheet was deleted or anonymised. The voucher keeps everything it was sold with \u2014 refund it or move it to another sheet.",
    emptyOrphans: "No voucher has lost its customer.",
    errorOrphans: "The vouchers with no customer could not be loaded.",
    orphanRemaining: "{remaining} session(s) left",
    orphanNoValue: "Fully used",
    orphanDeletedAt: "Customer deleted on {when}",
    orphanExpired: "Expired",
    orphanCustomerRef: "Customer reference",
    orphansCount: "{shown} of {total}",
    orphansMore: "Load more",
    actionGrants: "Sold vouchers",
    grantsTitle: "Sold vouchers",
    grantsHint: "every customer who bought this voucher, with the sessions used and left. A live voucher can get extra sessions or a later expiry as a courtesy, or have sessions removed to correct its balance; a sale nothing was used from can be voided.",
    emptyGrants: "Nobody has bought this voucher yet.",
    errorGrants: "Could not load the sold vouchers",
    grantsCount: "Showing {shown} of {total}",
    grantsMore: "Load more",
    grantStatus: {
      active: "Active",
      voided: "Voided"
    },
    grantUses: "{used} used \xB7 {remaining} left",
    grantUsesUnlimited: "{used} used \xB7 no limit",
    grantVoidedBy: "Voided by {who} on {when}",
    actionVoidGrant: "Void",
    btnVoiding: "Voiding\u2026",
    voidGrantTitle: "Void this voucher?",
    voidGrantHint: "The voucher of customer {customer} ({amount}) stops being usable and stays in the list as voided. The money is not given back here: if it was paid, refund the sale from Sales with a return.",
    voidReasonLabel: "Reason",
    voidReasonHelp: "Required. It stays on the voucher's record, e.g. \xABsold to the wrong customer\xBB.",
    errorVoidGrant: "Could not void the voucher",
    nameLoading: "Loading name\u2026",
    grantExpires: "Expires {when}",
    grantNoExpiry: "Never expires",
    grantAdjusted: "Given afterwards: +{uses} session(s), +{days} day(s)",
    actionAdjustGrant: "Adjust",
    adjustGrantTitle: "Adjust this voucher",
    adjustGrantHint: "Give customer {customer} extra sessions or a later expiry at no charge, or remove sessions to correct the balance. It is recorded in the voucher's movements with who, when and why.",
    adjustUsesLabel: "Sessions to add",
    adjustUsesHelp: "{remaining} left now. Up to 100.",
    adjustDaysLabel: "Days to extend",
    adjustDaysHelp: "Expires {when} now. Up to 366.",
    adjustReasonHelp: "Required. It stays on the voucher's record, e.g. \xABwe were closed in August\xBB.",
    adjustPreview: "After the adjustment: {remaining} session(s) left \xB7 expires {when}",
    adjustPreviewUnlimited: "no limit of",
    errorAdjustGrant: "Could not adjust the voucher",
    movementAdjusted: "+{uses} session(s) \xB7 +{days} day(s)",
    movementAdjustedBy: "Given by {who}",
    grantCorrected: "Corrected afterwards: \u2212{uses} session(s), +{days} day(s)",
    adjustAddSessions: "Add sessions",
    adjustRemoveSessions: "Remove sessions",
    adjustRemoveUsesLabel: "Sessions to remove",
    adjustRemoveUsesHelp: "{remaining} left now. You can remove up to {remaining}.",
    movementCorrected: "\u2212{uses} session(s) \xB7 +{days} day(s)",
    movementCorrectedBy: "Corrected by {who}",
    errNotAnAmount: "This is not an amount. Type a figure, for example 12.50.",
    errAmbiguousAmount: "This amount can be read in two ways: \xAB{typed}\xBB could be {grouped} or {decimal}. Write the decimals so there is no doubt.",
    errNegativeAmount: "This amount cannot be negative."
  },
  errors: {
    "services.category_unavailable": "That category is not available: it does not exist in this business or it has been deleted.",
    "services.service_update_rejected": "The service could not be updated: it does not exist in this business, or the category you picked does not.",
    "services.service_not_found": "That service does not exist in this business.",
    "services.service_not_archived": "That service could not be brought back: it does not exist in this business, or it is already being offered.",
    "services.parent_category_unavailable": "That parent category is not available: it does not exist in this business or it has been deleted.",
    "services.category_update_rejected": "The category could not be updated: it does not exist in this business, or the parent you picked does not (or is the category itself).",
    "services.category_name_taken": "There is already a category with that name. Pick another name.",
    "services.category_not_found": "That category does not exist in this business.",
    "services.package_not_found": "That package does not exist in this business.",
    "services.package_no_grant": "This customer does not have that voucher: nobody has sold it to them.",
    "services.grant_customer_required": "Pick the customer this voucher belongs to: a voucher with no owner cannot be redeemed.",
    "services.package_needs_lines": "A package needs at least one service line: a package with no lines cannot be sold or redeemed.",
    "services.package_no_uses_left": "This voucher has no sessions left.",
    "services.package_expired": "This voucher has expired.",
    "services.package_voided": "This voucher was voided: it can no longer be used.",
    "services.package_not_redeemable": "This voucher cannot be redeemed right now.",
    "services.package_does_not_cover_service": "This voucher does not cover that service. A voucher of haircuts pays for haircuts, not for the shampoo.",
    "services.hold_not_releasable": "That voucher session can no longer be given back: the sale was already paid. Refunding it is a return, and it goes through its own door.",
    "services.hold_not_settleable": "That voucher session could not be settled: it does not exist here, it was already given back, or it was settled before.",
    "services.redemption_not_found": "That voucher session does not exist in this business.",
    "services.redemption_not_settled": "That voucher session was never paid, so there is nothing to give back. Release the hold instead.",
    "services.redemption_already_refunded": "That voucher session was already given back on another return.",
    "services.redemption_not_refundable": "That voucher session cannot be given back right now.",
    "services.grant_not_found": "That voucher sale does not exist in this business.",
    "services.grant_already_voided": "That voucher was already voided.",
    "services.grant_in_use": "That voucher was already used: it cannot be voided.",
    "services.grant_void_reason_required": "Say why this voucher is being voided: the reason stays on its record.",
    "services.grant_not_voidable": "That voucher cannot be voided right now: it was used or voided in the meantime. Reload the list and try again.",
    "services.grant_adjust_reason_required": "Say why this voucher is being adjusted: the reason stays on its record.",
    "services.grant_adjust_invalid": "Sessions must be a whole number up to 100 (to add or to remove), and days from 0 to 366.",
    "services.grant_adjust_empty": "Add or remove at least one session, or add at least one day.",
    "services.grant_unlimited": "That voucher has no session limit: there are no sessions to add or remove.",
    "services.grant_no_expiry": "That voucher never expires: there is no expiry to extend.",
    "services.grant_not_adjustable": "That voucher cannot be adjusted right now: it was voided, or its sessions used, in the meantime. Reload the list and try again.",
    "services.grant_adjust_below_used": "You cannot take away more sessions than the customer has left."
  }
};

// @erplora/module-services/ui/lib/domain-error.ts
var ERRORS = {
  es: es_default.errors ?? {},
  en: en_default.errors ?? {}
};
var INTERNALS = ["sqlx", "db:", "bind parameter", "constraint", "at line ", "panicked"];
function presentable(text) {
  const t5 = text.trim().toLowerCase();
  return t5.length > 0 && !INTERNALS.some((mark) => t5.includes(mark));
}
function domainMessage(e6, lang, fallback) {
  const code = typeof e6 === "object" && e6 !== null ? e6.code : void 0;
  if (typeof code === "string") {
    const translated = ERRORS[lang]?.[code] ?? ERRORS.en[code];
    if (translated) return translated;
  }
  const message = e6 instanceof Error ? e6.message : "";
  return presentable(message) ? message : fallback;
}

// @erplora/module-services/ui/lib/ion-tone.ts
var PALETTE = {
  danger: { base: "#c5000f", contrast: "#fff", shade: "#ad000d", tint: "#cb1a27" },
  warning: { base: "#ffc409", contrast: "#000", shade: "#e0ac08", tint: "#ffca22" }
};
function ionTone2(kind, tone) {
  const p4 = PALETTE[tone];
  const token = (suffix, fallback) => `var(--ion-color-${tone}${suffix}, ${fallback})`;
  switch (kind) {
    case "solid":
      return [
        `--background: ${token("", p4.base)}`,
        `--background-activated: ${token("-shade", p4.shade)}`,
        `--background-focused: ${token("-shade", p4.shade)}`,
        `--background-hover: ${token("-tint", p4.tint)}`,
        `--color: ${token("-contrast", p4.contrast)};`
      ].join("; ");
    case "text":
      return `--color: ${token("", p4.base)}; color: ${token("", p4.base)};`;
  }
}

// @erplora/module-services/ui/components/erp-services-categories/erp-services-categories.ts
var CATALOG = { es: es_default, en: en_default };
function erplora() {
  const c5 = globalThis.erplora;
  if (!c5) throw new Error("erplora SDK no inicializado por el shell");
  return c5;
}
function can(permission) {
  const client = erplora();
  return typeof client.hasPermission === "function" ? client.hasPermission(permission) : true;
}
var ErpServicesCategories = class extends i3 {
  constructor() {
    super(...arguments);
    this.newName = "";
    this.newParent = "";
    this.newSortOrder = "";
    this.saving = false;
    this.formError = "";
    this.pageError = "";
    this.nameError = "";
    this.editingId = null;
    this.editTitleInHeader = false;
    /** pm#459: generation of the last edit opening; the header check of an earlier one (its table
     *  render settling late) sees a newer number and gives up, so the LAST tap wins. */
    this.editSeq = 0;
    this.deleteTarget = null;
    this.allCategories = [];
    this.onLocaleChange = () => this.requestUpdate();
  }
  static {
    this.styles = i`
    :host { display: flex; flex-direction: column; height: 100%; min-height: 0; font-family: system-ui, sans-serif; color: var(--ion-text-color, #1c1b18); }
    .page { display: flex; flex-direction: column; min-height: 0; flex: 1 1 auto; }
    .page > ok-data-table { flex: 1 1 auto; min-height: 0; }
    .form { display: flex; flex-direction: column; gap: 0.7rem; }
    .form ion-button[type='submit'] { align-self: flex-end; }
  `;
  }
  get columns() {
    const t5 = (k2) => erplora().t(CATALOG, k2);
    const nameOf2 = (id) => this.allCategories.find((c5) => c5.id === id)?.name ?? "\u2014";
    return [
      { key: "name", header: t5("ui.colName"), sortable: true, filterable: true, filterType: "text" },
      { key: "parent_id", header: t5("ui.colParent"), sortable: true, format: (r6) => nameOf2(r6.parent_id) },
      { key: "sort_order", header: t5("ui.colSortOrder"), align: "right", sortable: true },
      { key: "service_count", header: t5("ui.colServiceCount"), align: "right", sortable: true, filterable: true, filterType: "range" }
    ];
  }
  get actions() {
    const t5 = (k2) => erplora().t(CATALOG, k2);
    return [
      ...can("services.change_category") ? [{ id: "edit", label: t5("ui.actionEdit"), icon: "create-outline" }] : [],
      ...can("services.delete_category") ? [{ id: "delete", label: t5("ui.actionDelete"), icon: "trash-outline", color: "danger" }] : []
    ];
  }
  async connectedCallback() {
    super.connectedCallback();
    window.addEventListener("erplora:locale-changed", this.onLocaleChange);
    this.ctrl = createListController(erplora(), "services.categories.list", () => this.requestUpdate(), {
      pageSize: 50,
      sort: "name",
      dir: "asc"
    });
    await Promise.all([this.ctrl.load(), this.loadAll()]);
    try {
      const off1 = erplora().on("services.service.created", () => this.ctrl.load());
      const off2 = erplora().on("services.service.updated", () => this.ctrl.load());
      const off3 = erplora().on("services.service.deleted", () => this.ctrl.load());
      this.unsub = () => {
        off1();
        off2();
        off3();
      };
    } catch {
    }
  }
  disconnectedCallback() {
    window.removeEventListener("erplora:locale-changed", this.onLocaleChange);
    super.disconnectedCallback();
    this.unsub?.();
  }
  async loadAll() {
    try {
      this.allCategories = await erplora().queryAll("services.categories.list", { sort: "name", dir: "asc" }) ?? [];
    } catch {
      this.allCategories = [];
    }
  }
  dataTable() {
    return this.renderRoot.querySelector("ok-data-table");
  }
  /** pm#450: the table's «Add» emits no event and keeps our form state; after an edit it would
   *  show the edited record under a «New» header, and the submit would UPDATE it. */
  onTableClick(e6) {
    if (!this.editingId) return;
    const addId = "services-categories-table-add";
    if (e6.composedPath().some((n6) => n6 instanceof HTMLElement && n6.dataset.testid === addId)) this.cancelEdit();
  }
  /** Wired natively, not with a Lit `@click` on the tag: `<ok-data-table>` carries `testid`, not
   *  `data-testid` (outfitkit#143), and a template binding would read as an action element that
   *  demands one. */
  firstUpdated() {
    this.renderRoot.querySelector("ok-data-table")?.addEventListener("click", (e6) => this.onTableClick(e6));
  }
  async onRowAction(ev) {
    const { actionId, row } = ev.detail;
    const c5 = row;
    if (actionId === "edit" && can("services.change_category")) {
      const seq = ++this.editSeq;
      this.editingId = c5.id;
      this.newName = c5.name ?? "";
      this.newParent = c5.parent_id ?? "";
      this.newSortOrder = String(c5.sort_order ?? 0);
      this.formError = "";
      this.nameError = "";
      const title = `${erplora().t(CATALOG, "ui.editingCategoryTitle")} \u2014 ${this.newName}`;
      const table = this.dataTable();
      table?.open("edit", { title });
      await table?.updateComplete;
      if (seq !== this.editSeq) return;
      this.editTitleInHeader = table?.shadowRoot?.querySelector('[role="dialog"]')?.getAttribute("aria-label") === title;
    } else if (actionId === "delete" && can("services.delete_category")) {
      this.deleteTarget = c5;
      this.pageError = "";
    }
  }
  /** Back to a clean CREATE form. */
  cancelEdit() {
    this.editingId = null;
    this.newName = "";
    this.newParent = "";
    this.newSortOrder = "";
    this.formError = "";
    this.nameError = "";
  }
  /** Submit: create OR update by `editingId`. The update goes through the PARTIAL door
   *  (`records.category.patch`, hub#632): id + edited fields; the runtime completes slug/is_active. */
  async save(ev) {
    ev.preventDefault();
    const required = this.editingId ? "services.change_category" : "services.add_category";
    if (!can(required) || !this.newName.trim()) return;
    this.saving = true;
    this.formError = "";
    this.nameError = "";
    this.pageError = "";
    try {
      const fields = {
        name: this.newName.trim(),
        parent_id: this.newParent || null,
        sort_order: Number(this.newSortOrder) || 0
      };
      if (this.editingId) {
        await erplora().command("services.categories.update", { category_id: this.editingId, ...fields });
      } else {
        await erplora().command("services.categories.create", fields);
      }
      this.cancelEdit();
      this.dataTable()?.close();
      await Promise.all([this.ctrl.load(), this.loadAll()]);
    } catch (e6) {
      const message = domainMessage(e6, erplora().locale, erplora().t(CATALOG, "ui.errorSaveCategory"));
      if (e6?.code === "services.category_name_taken") this.nameError = message;
      else this.formError = message;
    } finally {
      this.saving = false;
    }
  }
  async confirmDelete() {
    const target = this.deleteTarget;
    if (!target || !can("services.delete_category")) return;
    this.saving = true;
    try {
      await erplora().command("services.categories.delete", { category_id: target.id });
      this.deleteTarget = null;
      await Promise.all([this.ctrl.load(), this.loadAll()]);
    } catch (e6) {
      this.pageError = domainMessage(e6, erplora().locale, erplora().t(CATALOG, "ui.errorDeleteCategory"));
      this.deleteTarget = null;
    } finally {
      this.saving = false;
    }
  }
  renderDeleteConfirm() {
    const t5 = (k2, p4) => erplora().t(CATALOG, k2, p4);
    const count = Number(this.deleteTarget?.service_count ?? 0) || 0;
    return b2`<ion-modal .isOpen=${!!this.deleteTarget} @ionModalDidDismiss=${() => this.deleteTarget = null}>
      <ion-header class="ion-no-border">
        <ion-toolbar><ion-title>${t5("ui.deleteCategoryTitle")}</ion-title></ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <!-- Self-styled: ion-modal is reparented to <body>, this component's CSS does not reach it. -->
        <ion-list lines="none">
          <ion-item>
            <ion-label class="ion-text-wrap"><b>${this.deleteTarget?.name ?? ""}</b> — ${t5("ui.deleteCategoryHint")}</ion-label>
          </ion-item>
          ${count > 0 ? b2`<ion-item>
                <ion-icon slot="start" name="alert-circle-outline" data-testid="services-categories-delete-impact-icon" style=${ionTone2("text", "warning")}></ion-icon>
                <ion-label class="ion-text-wrap">${t5("ui.deleteCategoryImpact", { count })}</ion-label>
              </ion-item>` : A}
        </ion-list>
        <ion-button class="ion-margin-top" expand="block" data-testid="services-categories-delete-submit" style=${ionTone2("solid", "danger")} ?disabled=${this.saving} @click=${() => this.confirmDelete()}>${t5("ui.actionDelete")}</ion-button>
        <ion-button expand="block" fill="outline" data-testid="services-categories-delete-cancel" ?disabled=${this.saving} @click=${() => this.deleteTarget = null}>${t5("ui.btnCancel")}</ion-button>
      </ion-content>
    </ion-modal>`;
  }
  /** pm#478: the refusal appears ABOVE the button that was pressed, at the foot of the form — on a
   *  phone that can leave it off the sheet. Bring it into view once it has painted itself: scrolled
   *  before, the banner still measures 0 px and ends up under the tab bar. */
  updated(changed) {
    super.updated(changed);
    if (changed.has("formError") && this.formError) void this.revealFormError();
  }
  async revealFormError() {
    const banner = this.renderRoot.querySelector('[data-testid="services-categories-form-error"]');
    await banner?.updateComplete;
    banner?.scrollIntoView?.({ block: "center" });
  }
  render() {
    const t5 = (k2) => erplora().t(CATALOG, k2);
    const parentOptions = this.allCategories.filter((c5) => c5.id !== this.editingId);
    return b2`<div class="page">
      ${this.pageError ? b2`<ok-inline-feedback data-testid="services-categories-page-error" tone="danger" icon="alert-circle-outline">${this.pageError}</ok-inline-feedback>` : A}
      ${this.ctrl?.error && !dataTableShowsLoadError() ? b2`<ok-inline-feedback data-testid="services-categories-load-error" tone="danger" icon="alert-circle-outline">${this.ctrl.error}</ok-inline-feedback>` : A}
      <ok-data-table testid="services-categories-table" .error=${this.ctrl?.error ?? ""} @retry=${() => Promise.all([this.ctrl?.load(), this.loadAll()])} .serverSide=${true} .fill=${true} .views=${true} .addable=${can("services.add_category")} .cardTitle=${(row) => String(row.name ?? "")} .columns=${this.columns} .rows=${this.ctrl?.rows ?? []} .total=${this.ctrl?.total ?? 0} .page=${this.ctrl?.state.page ?? 0} .pageSize=${this.ctrl?.state.pageSize ?? 50} .sort=${this.ctrl?.state.sort} .sortDir=${this.ctrl?.state.dir ?? "asc"} .searchable=${true} .searchPlaceholder=${t5("ui.searchCategoryPlaceholder")} .actions=${this.actions} .rowClickable=${true} .emptyMessage=${this.ctrl?.loading ? t5("ui.loading") : t5("ui.emptyCategories")} @rowAction=${(e6) => this.onRowAction(e6)} @rowClick=${(e6) => this.onRowAction({ detail: { actionId: "edit", row: e6.detail.row } })}
 @pageChange=${(e6) => this.ctrl.setPage(e6.detail)} @pageSizeChange=${(e6) => this.ctrl.setPageSize(e6.detail)} @sortChange=${(e6) => this.ctrl.setSort(e6.detail.sort, e6.detail.dir)} @searchChange=${(e6) => this.ctrl.setSearch(e6.detail)} @filterChange=${(e6) => this.ctrl.setFilter(e6.detail.col, e6.detail.value)}>
        <form slot="create" class="form" data-testid="services-categories-form" @submit=${(e6) => this.save(e6)}>
          ${this.editingId && !this.editTitleInHeader ? b2`<ok-inline-feedback data-testid="services-categories-editing" tone="info" icon="create-outline">
                <b>${t5("ui.editingCategoryTitle")}</b> — ${this.newName}
                <ion-button size="small" fill="clear" data-testid="services-categories-edit-cancel" @click=${() => this.cancelEdit()}>${t5("ui.editingCancel")}</ion-button>
              </ok-inline-feedback>` : A}
          <ion-input data-testid="services-categories-name" fill="outline" label-placement="floating" label=${t5("ui.colName")} class=${e5({ "ion-invalid": !!this.nameError, "ion-touched": !!this.nameError })} error-text=${this.nameError || A} .value=${this.newName} @ionInput=${(e6) => {
      this.newName = e6.target.value;
      this.nameError = "";
    }}></ion-input>
          <ion-select data-testid="services-categories-parent" fill="outline" label-placement="floating" label=${t5("ui.colParent")} placeholder=${t5("ui.placeholderParent")} .value=${this.newParent} @ionChange=${(e6) => this.newParent = e6.target.value}>
            <ion-select-option value="">${t5("ui.optionNoParent")}</ion-select-option>
            ${parentOptions.map((c5) => b2`<ion-select-option .value=${c5.id}>${c5.name}</ion-select-option>`)}
          </ion-select>
          <ion-input data-testid="services-categories-sort-order" fill="outline" label-placement="floating" label=${t5("ui.colSortOrder")} type="number" step="1" .value=${this.newSortOrder} @ionInput=${(e6) => this.newSortOrder = e6.target.value}></ion-input>
          <!-- pm#478: the refusal travels WITH the form — on a phone the panel is a full-screen
               sheet and a banner on the page underneath it is never seen. -->
          ${this.formError ? b2`<ok-inline-feedback data-testid="services-categories-form-error" tone="danger" icon="alert-circle-outline">${this.formError}</ok-inline-feedback>` : A}
          <ion-button type="submit" data-testid="services-categories-submit" ?disabled=${this.saving || !this.newName}>${this.saving ? t5("ui.btnSaving") : this.editingId ? t5("ui.btnSave") : t5("ui.btnAdd")}</ion-button>
        </form>
      </ok-data-table>
      ${this.renderDeleteConfirm()}
    </div>`;
  }
};
__decorateClass([
  r5()
], ErpServicesCategories.prototype, "newName", 2);
__decorateClass([
  r5()
], ErpServicesCategories.prototype, "newParent", 2);
__decorateClass([
  r5()
], ErpServicesCategories.prototype, "newSortOrder", 2);
__decorateClass([
  r5()
], ErpServicesCategories.prototype, "saving", 2);
__decorateClass([
  r5()
], ErpServicesCategories.prototype, "formError", 2);
__decorateClass([
  r5()
], ErpServicesCategories.prototype, "pageError", 2);
__decorateClass([
  r5()
], ErpServicesCategories.prototype, "nameError", 2);
__decorateClass([
  r5()
], ErpServicesCategories.prototype, "editingId", 2);
__decorateClass([
  r5()
], ErpServicesCategories.prototype, "editTitleInHeader", 2);
__decorateClass([
  r5()
], ErpServicesCategories.prototype, "deleteTarget", 2);
__decorateClass([
  r5()
], ErpServicesCategories.prototype, "allCategories", 2);
define("erp-services-categories", ErpServicesCategories);

// @erplora/module-toolkit/src/money-input.mjs
var SPACING = "\\s'\\u2019\\u02bc";
var GROUP_SEP = new RegExp(`[.,${SPACING}]`);
var MINUS = /[-\u2212]/;
var SIGN = /[-+\u2212]/;
var SIGNS = /[-+\u2212]/g;
var BRACKET = /[()]/;
var CURRENCY_SIGNS = /\p{Sc}/gu;
var AFFIX_FILLER = new RegExp(`^[${SPACING}\\p{Cf}.,+\\-\\u2212]*$`, "u");
var NOT_AN_AMOUNT = Object.freeze({ ok: false, code: "not_an_amount" });
function checkDecimals(decimals2) {
  if (!Number.isInteger(decimals2) || decimals2 < 0 || decimals2 > 4) {
    throw new RangeError(`money_input_decimals_invalid: ${String(decimals2)}`);
  }
}
function currencyWords(currency, locale) {
  if (currency === void 0) return [];
  if (typeof currency !== "string" || !/^[A-Za-z]{3}$/.test(currency)) {
    throw new RangeError(`money_input_currency_invalid: ${String(currency)}`);
  }
  const words = /* @__PURE__ */ new Set([currency.toLowerCase()]);
  for (const lang of [locale || "en", "en"]) {
    for (const currencyDisplay of ["symbol", "narrowSymbol"]) {
      const part = new Intl.NumberFormat(lang, { style: "currency", currency, currencyDisplay }).formatToParts(1).find((p4) => p4.type === "currency");
      if (part) words.add(part.value.toLowerCase());
    }
  }
  return [...words].sort((a3, b3) => b3.length - a3.length);
}
function isCurrencyOnly(affixes, words) {
  let rest = affixes.toLowerCase();
  if (!words.length) rest = rest.replace(CURRENCY_SIGNS, " ");
  for (const word of words) rest = rest.split(word).join(" ");
  return AFFIX_FILLER.test(rest);
}
function isGrouping(intPart) {
  const groups = intPart.split(GROUP_SEP);
  if (groups.length < 2) return false;
  const [first, ...rest] = groups;
  const last = rest.pop();
  return /^[1-9]\d{0,2}$/.test(first) && rest.every((g3) => /^\d{2,3}$/.test(g3)) && /^\d{3}$/.test(last);
}
function digitsToMinor(intDigits2, fracDigits, decimals2) {
  const padded = fracDigits.padEnd(decimals2 + 1, "0");
  const kept = (intDigits2 || "0") + padded.slice(0, decimals2);
  let minor = Number(kept);
  if (Number(padded[decimals2]) >= 5) minor += 1;
  return Number.isSafeInteger(minor) ? minor : null;
}
function signed(minor, negative) {
  return negative && minor !== 0 ? -minor : minor;
}
function splitCore(core, decimals2) {
  const dots = (core.match(/\./g) ?? []).length;
  const commas = (core.match(/,/g) ?? []).length;
  if (dots && commas) {
    const dec = core.lastIndexOf(".") > core.lastIndexOf(",") ? "." : ",";
    if ((dec === "." ? dots : commas) !== 1) return null;
    const at2 = core.lastIndexOf(dec);
    return { intPart: core.slice(0, at2), frac: core.slice(at2 + 1) };
  }
  if (dots + commas !== 1) return { intPart: core, frac: "" };
  const at = Math.max(core.lastIndexOf("."), core.lastIndexOf(","));
  const intPart = core.slice(0, at);
  const tail = core.slice(at + 1);
  if (tail.length === 3 && isGrouping(core)) {
    if (decimals2 === 0) return { intPart: core, frac: "" };
    if (decimals2 !== 3) return { ambiguous: { intPart, tail } };
  }
  return { intPart, frac: tail };
}
function intDigits(intPart) {
  if (!GROUP_SEP.test(intPart)) return /^\d*$/.test(intPart) ? intPart : null;
  return isGrouping(intPart) ? intPart.replace(/\D/g, "") : null;
}
function parseMoneyInput(typed, decimals2, options = {}) {
  checkDecimals(decimals2);
  const words = currencyWords(options.currency, options.locale);
  if (typeof typed === "number") return parseNumber(typed, decimals2);
  const raw = String(typed ?? "").trim();
  if (!raw) return { ok: true, minor: null };
  const firstDigit = raw.search(/\d/);
  if (firstDigit < 0) return NOT_AN_AMOUNT;
  const start = firstDigit > 0 && /[.,]/.test(raw[firstDigit - 1]) ? firstDigit - 1 : firstDigit;
  const end = raw.search(/\d\D*$/) + 1;
  const prefix = raw.slice(0, start);
  const suffix = raw.slice(end);
  const core = raw.slice(start, end);
  const signs = prefix.match(SIGNS) ?? [];
  if (signs.length > 1 || SIGN.test(suffix) || BRACKET.test(prefix + suffix)) return NOT_AN_AMOUNT;
  if (!isCurrencyOnly(`${prefix} ${suffix}`, words)) return NOT_AN_AMOUNT;
  const negative = signs.length === 1 && MINUS.test(signs[0]);
  const split = splitCore(core, decimals2);
  if (!split) return NOT_AN_AMOUNT;
  if ("ambiguous" in split) {
    const { intPart, tail } = split.ambiguous;
    const digits = intPart.replace(/\D/g, "");
    const grouped = digitsToMinor(digits + tail, "", decimals2);
    const decimal = digitsToMinor(digits, tail, decimals2);
    if (grouped === null || decimal === null) return NOT_AN_AMOUNT;
    return {
      ok: false,
      code: "ambiguous_amount",
      readings: { grouped: signed(grouped, negative), decimal: signed(decimal, negative) }
    };
  }
  const whole = intDigits(split.intPart);
  if (whole === null || split.frac && !/^\d+$/.test(split.frac)) return NOT_AN_AMOUNT;
  const minor = digitsToMinor(whole, split.frac, decimals2);
  return minor === null ? NOT_AN_AMOUNT : { ok: true, minor: signed(minor, negative) };
}
function parseNumber(n6, decimals2) {
  const m4 = /^(\d+)(?:\.(\d+))?$/.exec(String(Math.abs(n6)));
  if (!m4) return NOT_AN_AMOUNT;
  const minor = digitsToMinor(m4[1], m4[2] ?? "", decimals2);
  return minor === null ? NOT_AN_AMOUNT : { ok: true, minor: signed(minor, n6 < 0) };
}
function formatMoneyInput(minor, decimals2, locale) {
  checkDecimals(decimals2);
  if (minor == null) return "";
  return new Intl.NumberFormat(locale || "en", {
    minimumFractionDigits: decimals2,
    maximumFractionDigits: decimals2,
    useGrouping: false,
    numberingSystem: "latn"
  }).format(minor / 10 ** decimals2);
}
function normaliseMoneyInput(typed, decimals2, locale, currency) {
  const parsed = parseMoneyInput(typed, decimals2, { currency, locale });
  return parsed.ok && parsed.minor !== null ? formatMoneyInput(parsed.minor, decimals2, locale) : typed;
}

// @erplora/module-services/ui/components/erp-services-list/erp-services-list.ts
var CATALOG2 = { es: es_default, en: en_default };
function currencyDecimals() {
  const d3 = erplora2().currencyDecimals;
  return typeof d3 === "number" ? d3 : 2;
}
function readPrice(typed) {
  const c5 = erplora2();
  const d3 = currencyDecimals();
  const raw = String(typed ?? "");
  const read = parseMoneyInput(raw, d3, { currency: c5.currency || void 0, locale: c5.locale });
  if (read.ok) {
    const minor = read.minor ?? 0;
    return minor < 0 ? { ok: false, key: "ui.errNegativeAmount" } : { ok: true, minor };
  }
  if (read.code === "ambiguous_amount") {
    return {
      ok: false,
      key: "ui.errAmbiguousAmount",
      params: {
        typed: raw.trim(),
        grouped: formatMoneyInput(read.readings.grouped, d3, c5.locale),
        decimal: formatMoneyInput(read.readings.decimal, d3, c5.locale)
      }
    };
  }
  return { ok: false, key: "ui.errNotAnAmount" };
}
function toMajorText(minor) {
  return formatMoneyInput(Number(minor) || 0, currencyDecimals(), erplora2().locale || "en");
}
function taxCategoryDisplayName(c5) {
  return (c5.display_name ?? "").trim() || (c5.name ?? "").trim() || c5.key;
}
var PRICING_TYPES = ["fixed", "hourly", "from", "variable", "free"];
var FILTERABLE_STATUSES = ["active", "unconfigured", "inactive"];
var ARCHIVED_STATUS = "inactive";
function stateOf(row) {
  const declared = String(row.status ?? "").trim();
  if (declared) return declared;
  return String(row.tax_category_key ?? "").trim() ? "active" : "unconfigured";
}
var STATE_COLOR = {
  active: "var(--ion-color-success, #2dd36f)",
  inactive: "var(--ion-color-medium, #92949c)",
  unconfigured: "var(--ion-color-danger, #eb445a)"
};
function badgeStyle(state) {
  const tone = STATE_COLOR[state] ?? STATE_COLOR.inactive;
  return `display:inline-block;padding:.1rem .45rem;border-radius:999px;font-size:.78rem;font-weight:600;white-space:nowrap;background:color-mix(in srgb, ${tone} 18%, transparent);color:color-mix(in srgb, ${tone} 70%, #000);`;
}
var REASON_STYLE = `display:block;margin-top:.15rem;font-size:.72rem;line-height:1.2;color:color-mix(in srgb, ${STATE_COLOR.unconfigured} 70%, #000);`;
function erplora2() {
  const c5 = globalThis.erplora;
  if (!c5) throw new Error("erplora SDK no inicializado por el shell");
  return c5;
}
function can2(permission) {
  const client = erplora2();
  return typeof client.hasPermission === "function" ? client.hasPermission(permission) : true;
}
var ErpServicesList = class extends i3 {
  constructor() {
    super(...arguments);
    this.categories = [];
    this.taxRates = [];
    this.formError = "";
    this.pageError = "";
    this.newName = "";
    this.newPrice = "";
    this.newDuration = "";
    this.newCategory = "";
    this.newTaxRateId = "";
    this.saving = false;
    this.tick = 0;
    this.showingArchived = false;
    this.editingId = null;
    this.editTitleInHeader = false;
    /** pm#459: generation of the last edit opening; a stale wait (row fetch, table render) of an
     *  earlier one sees a newer number and gives up, so the LAST tap wins. */
    this.editSeq = 0;
    this.archiveTarget = null;
    this.archiveActive = null;
    // TODO-LIT: componentWillLoad → connectedCallback. Recuerda: connectedCallback se dispara
    // en CADA reconexión al DOM (no solo en el primer montaje). Si la init debe correr una
    // sola vez tras el primer render, considera firstUpdated() en su lugar.
    // Re-render al cambiar el idioma del shell (ADR-0055): los getters `columns`/`actions` y el
    // texto del template se re-evalúan con el nuevo `erplora.locale`.
    this.onLocaleChange = () => this.requestUpdate();
  }
  static {
    this.styles = i`
    :host { display:flex; flex-direction:column; height:100%; min-height:0; font-family: system-ui, sans-serif; color: var(--ion-text-color, #1c1b18); }
    /* La vista llena el alto: el data-table ocupa todo (scroll interno, pie fijo). */
    .page { display:flex; flex-direction:column; min-height:0; flex:1 1 auto; }
    .page > ok-data-table { flex:1 1 auto; min-height:0; }
    /* El alta vive en el panel lateral de la tabla (estrecho): los campos van APILADOS. */
    .form { display:flex; flex-direction:column; gap:.7rem; }
    .form ion-button { align-self:flex-end; }
    .err { color:#d9480f; font-weight:600; }
  `;
  }
  get columns() {
    const t5 = (k2) => erplora2().t(CATALOG2, k2);
    return [
      { key: "name", header: t5("ui.colName"), sortable: true, filterable: true, filterType: "text" },
      {
        key: "category",
        header: t5("ui.colCategory"),
        sortable: true,
        filterable: true,
        // Dominio cerrado (las categorías del hub). El servidor filtra por el NOMBRE de la
        // categoría (`category`, `op: eq`), no por su id: el `value` de la opción es el nombre.
        filterType: "select",
        options: this.categories.map((c5) => ({ value: c5.name, label: c5.name })),
        format: (r6) => r6.category ?? "\u2014"
      },
      {
        key: "pricing_type",
        header: t5("ui.colPricingType"),
        sortable: true,
        filterable: true,
        filterType: "select",
        options: PRICING_TYPES.map((v3) => ({ value: v3, label: t5(`ui.pricingType.${v3}`) })),
        format: (r6) => t5(`ui.pricingType.${String(r6.pricing_type)}`)
      },
      {
        key: "price",
        header: t5("ui.colPrice"),
        align: "right",
        sortable: true,
        filterable: true,
        filterType: "range",
        // El precio se guarda en CÉNTIMOS (INTEGER, ADR-0007): 1500 = 15,00 €. El helper canónico
        // `formatMoney` divide por 10^decimales (no /100 a ciegas: en JPY/KWD sería distinto).
        format: (r6) => erplora2().formatMoney(Number(r6.price) || 0)
      },
      { key: "duration_minutes", header: t5("ui.colDuration"), align: "right", sortable: true, filterable: true, filterType: "text" },
      {
        key: "status",
        header: t5("ui.colStatus"),
        sortable: true,
        filterable: true,
        // Dominio cerrado (el servidor lo declara `op: eq`) → el filtro `select` aísla de verdad
        // los servicios que no se pueden cobrar, que es para lo que existe la columna.
        filterType: "select",
        options: FILTERABLE_STATUSES.map((v3) => ({ value: v3, label: t5(`ui.status.${v3}`) })),
        // Marcar sin decir POR QUÉ es una etiqueta sobre la que nadie puede actuar: el motivo se
        // pinta al lado, no solo en un `title` que en una tablet no existe. `render` vale para las
        // dos vistas de la tabla (lista y tarjeta), así que el motivo viaja también al móvil.
        render: (r6) => {
          const state = stateOf(r6);
          const reason = state === "unconfigured" ? t5("ui.statusReason.unconfigured") : "";
          return b2`<span style=${badgeStyle(state)} title=${reason || A}>${t5(`ui.status.${state}`)}</span>
            ${reason ? b2`<small style=${REASON_STYLE}>${reason}</small>` : A}`;
        }
      }
    ];
  }
  // «Archive», not «delete»: `services.services.delete` is a soft-delete + `is_active = 0` — the
  // service stops being offered and its history (and the appointments already booked, which keep
  // their own snapshot) stays. That is what Fresha/Square/Vagaro/Odoo do; none of them deletes a
  // service with future bookings. Only who holds the permission sees the action (services#2).
  //
  // While the ARCHIVED ones are on screen the row offers the way back instead (services#44), which
  // is how Square (`Unarchive`) and Fresha/Treatwell (the row's `⋯`) do it: the action lives on the
  // row, never inside the record — Shopify's «open it, scroll to the bottom, unarchive, then change
  // the state again» is six taps and two screens for one decision. Offering «archive» on something
  // already archived would be an offer to do nothing, so it goes.
  get actions() {
    const t5 = (k2) => erplora2().t(CATALOG2, k2);
    if (this.showingArchived) {
      return can2("services.change_service") ? [{ id: "restore", label: t5("ui.actionRestore"), icon: "arrow-undo-outline", color: "success" }] : [];
    }
    return [
      ...can2("services.change_service") ? [{ id: "edit", label: t5("ui.actionEdit"), icon: "create-outline" }] : [],
      ...can2("services.delete_service") ? [{ id: "archive", label: t5("ui.actionArchive"), icon: "archive-outline", color: "danger" }] : []
    ];
  }
  /** Filter change of the table. `status = inactive` is not one filter more: the archived services
   *  are NOT in the default answer of `services.services.list` at all (the diary consumes that very
   *  query as its selector of bookable services), so picking it has to widen the SCOPE too —
   *  otherwise the filter would only ever paint an empty table.
   *
   *  The scope is written straight into the controller's context and the reload is left to
   *  `setFilter`: `setContext` would reload on its own and the same tap would cost two round trips
   *  to the hub.
   *
   *  The value travels as typed: the «Price» range is scaled to the minor unit by the SDK
   *  (`moneyFilters`, services#113, pm#501). */
  onFilterChange(col, value) {
    if (col === "status") {
      this.showingArchived = String(value ?? "") === ARCHIVED_STATUS;
      this.ctrl.state.context = this.showingArchived ? { include_archived: 1 } : {};
    }
    this.ctrl.setFilter(col, value);
  }
  /** Puts an archived service back (`services.services.restore`). No confirmation: restoring is not
   *  destructive —it undoes one— and the market does not ask for one either. */
  async restoreService(row) {
    if (!can2("services.change_service")) return;
    this.pageError = "";
    this.saving = true;
    try {
      await erplora2().command("services.services.restore", { service_id: String(row.id) });
      await this.ctrl.load();
    } catch (e6) {
      this.pageError = domainMessage(e6, erplora2().locale, erplora2().t(CATALOG2, "ui.errorRestore"));
    } finally {
      this.saving = false;
    }
  }
  async connectedCallback() {
    super.connectedCallback();
    window.addEventListener("erplora:locale-changed", this.onLocaleChange);
    this.ctrl = createListController(erplora2(), "services.services.list", () => this.requestUpdate(), {
      pageSize: 50,
      sort: "name",
      dir: "asc",
      // `price` is an INTEGER in the minor unit painted as money of the hub («20,00 €»): the person
      // types the major unit and the SDK scales each edge with the hub's currency decimals.
      moneyFilters: ["price"]
    });
    await Promise.all([this.ctrl.load(), this.loadAux()]);
    try {
      const off1 = erplora2().on("services.service.created", () => this.ctrl.load());
      const off2 = erplora2().on("services.service.updated", () => this.ctrl.load());
      const off3 = erplora2().on("services.service.deleted", () => this.ctrl.load());
      this.unsub = () => {
        off1();
        off2();
        off3();
      };
    } catch {
    }
  }
  disconnectedCallback() {
    window.removeEventListener("erplora:locale-changed", this.onLocaleChange);
    super.disconnectedCallback();
    this.unsub?.();
  }
  async loadAux() {
    try {
      this.categories = await erplora2().queryAll("services.categories.list", { sort: "name", dir: "asc" }) ?? [];
    } catch {
    }
    try {
      const res = await erplora2().queryAll("taxes.categories.list", { sort: "display_name", dir: "asc" });
      this.taxRates = Array.isArray(res) ? res : [];
    } catch {
      this.taxRates = [];
    }
  }
  // Fiscal-category options for the ion-select: one category per row (value = canonical key).
  // There is NO empty option on purpose: «— (default)» was the door through which a service
  // nobody could charge was created. The label is the TRANSLATED `display_name`, without the
  // technical key glued to it (services#54): nobody giving a service high has to choose between
  // two taxonomies, they choose by name — the key still travels as the `value`, silent, because
  // it is the identifier that does not change. The % is resolved by `taxes` per country+category
  // (ADR-0085).
  taxOptions() {
    return this.taxRates.map(
      (c5) => b2`<ion-select-option .value=${c5.key}>${taxCategoryDisplayName(c5)}</ion-select-option>`
    );
  }
  // Referencia al ok-data-table para abrir/cerrar su panel lateral (el alta se proyecta dentro).
  dataTable() {
    return this.renderRoot.querySelector("ok-data-table");
  }
  /** pm#450: the table's «Add» emits no event and keeps our form state; after an edit it would
   *  show the edited record under a «New» header, and the submit would UPDATE it. */
  onTableClick(e6) {
    if (!this.editingId) return;
    const addId = "services-list-table-add";
    if (e6.composedPath().some((n6) => n6 instanceof HTMLElement && n6.dataset.testid === addId)) this.cancelEdit();
  }
  /** Wired natively, not with a Lit `@click` on the tag: `<ok-data-table>` carries `testid`, not
   *  `data-testid` (outfitkit#143), and a template binding would read as an action element that
   *  demands one. */
  firstUpdated() {
    const table = this.renderRoot.querySelector("ok-data-table");
    table?.addEventListener("click", (e6) => this.onTableClick(e6));
    table?.addEventListener("panelClose", () => this.editSeq++);
  }
  /** On leaving the price field: rewritten in the hub's notation when readable, left EXACTLY as
   *  typed when not — the refusal on save quotes it back (pm#521). */
  normalisePrice() {
    const c5 = erplora2();
    this.newPrice = normaliseMoneyInput(String(this.newPrice ?? ""), currencyDecimals(), c5.locale, c5.currency || void 0);
  }
  /** Back to a clean CREATE form (services#4). */
  cancelEdit() {
    this.editSeq++;
    this.editingId = null;
    this.newName = "";
    this.newPrice = "";
    this.newDuration = "";
    this.newCategory = "";
    this.newTaxRateId = "";
    this.formError = "";
  }
  /** Submit of the panel form: create OR update, decided by `editingId` (services#4). */
  async createService(ev) {
    ev.preventDefault();
    if (!this.newName.trim()) return;
    if (this.editingId) return this.saveEdit();
    if (!can2("services.add_service")) return;
    if (!this.newTaxRateId) {
      this.formError = erplora2().t(CATALOG2, "ui.errorTaxRequired");
      return;
    }
    const price = readPrice(this.newPrice);
    if (!price.ok) {
      this.formError = erplora2().t(CATALOG2, price.key, price.params);
      return;
    }
    this.saving = true;
    this.formError = "";
    this.pageError = "";
    try {
      await erplora2().command("services.services.create", {
        name: this.newName.trim(),
        description: "",
        short_description: "",
        category_id: this.newCategory || null,
        pricing_type: "fixed",
        // The field holds MAJOR units, the column MINOR units (ADR-0007): 15 € → 1500.
        price: price.minor,
        cost: 0,
        duration_minutes: Number(this.newDuration) || 60,
        buffer_before: 0,
        buffer_after: 0,
        max_capacity: 1,
        is_bookable: 1,
        requires_confirmation: 0,
        allow_online_booking: 1,
        sort_order: 0,
        is_featured: 0,
        sku: "",
        barcode: "",
        notes: "",
        tax_category_key: this.newTaxRateId
      });
      this.cancelEdit();
      this.dataTable()?.close();
      await this.ctrl.load();
    } catch (e6) {
      this.formError = domainMessage(e6, erplora2().locale, erplora2().t(CATALOG2, "ui.errorCreate"));
    } finally {
      this.saving = false;
    }
  }
  /** `services.services.update` through the PARTIAL door (`records.service.patch`, hub#632): only
   *  the id + what the form edits travel; the runtime completes the rest from the row, so the
   *  fields this form does not show (buffers, capacity, sku…) are never wiped by an edit. */
  async saveEdit() {
    if (!this.editingId || !can2("services.change_service")) return;
    if (!this.newTaxRateId) {
      this.formError = erplora2().t(CATALOG2, "ui.errorTaxRequired");
      return;
    }
    const price = readPrice(this.newPrice);
    if (!price.ok) {
      this.formError = erplora2().t(CATALOG2, price.key, price.params);
      return;
    }
    this.saving = true;
    this.formError = "";
    this.pageError = "";
    try {
      await erplora2().command("services.services.update", {
        service_id: this.editingId,
        name: this.newName.trim(),
        category_id: this.newCategory || null,
        price: price.minor,
        duration_minutes: Number(this.newDuration) || 60,
        tax_category_key: this.newTaxRateId
      });
      this.cancelEdit();
      this.dataTable()?.close();
      await this.ctrl.load();
    } catch (e6) {
      this.formError = domainMessage(e6, erplora2().locale, erplora2().t(CATALOG2, "ui.errorUpdate"));
    } finally {
      this.saving = false;
    }
  }
  async onRowAction(ev) {
    const { actionId, row } = ev.detail;
    if (actionId === "restore") return this.restoreService(row);
    if (actionId === "edit" && can2("services.change_service")) {
      const seq = ++this.editSeq;
      this.formError = "";
      let full = row;
      try {
        const rows = await erplora2().query("services.services.get", { service_id: String(row.id) });
        if (Array.isArray(rows) && rows[0]) full = rows[0];
      } catch {
      }
      if (seq !== this.editSeq) return;
      this.editingId = String(row.id);
      this.newName = String(full.name ?? "");
      this.newPrice = toMajorText(full.price);
      this.newDuration = String(full.duration_minutes ?? "");
      this.newCategory = String(full.category_id ?? "");
      this.newTaxRateId = String(full.tax_category_key ?? "");
      const title = `${erplora2().t(CATALOG2, "ui.editingTitle")} \u2014 ${this.newName}`;
      const table = this.dataTable();
      table?.open("edit", { title });
      await table?.updateComplete;
      if (seq !== this.editSeq) return;
      this.editTitleInHeader = table?.shadowRoot?.querySelector('[role="dialog"]')?.getAttribute("aria-label") === title;
      return;
    }
    if (actionId !== "archive" || !can2("services.delete_service")) return;
    this.pageError = "";
    this.archiveTarget = row;
    this.archiveActive = null;
    try {
      const rows = await erplora2().queryOptional(
        "appointments.appointments.count_active_for_service",
        { service_id: String(row.id) }
      );
      const first = Array.isArray(rows) ? rows[0] : null;
      if (first && this.archiveTarget?.id === row.id) this.archiveActive = first;
    } catch (e6) {
      console.warn("[services] appointments.appointments.count_active_for_service failed; archiving without the warning line", e6);
      this.archiveActive = null;
    }
  }
  /** Runs the confirmed archive (`services.services.delete`). */
  async confirmArchive() {
    const target = this.archiveTarget;
    if (!target || !can2("services.delete_service")) return;
    this.saving = true;
    try {
      await erplora2().command("services.services.delete", { service_id: target.id });
      this.archiveTarget = null;
      this.archiveActive = null;
      await this.ctrl.load();
    } catch (e6) {
      this.pageError = domainMessage(e6, erplora2().locale, erplora2().t(CATALOG2, "ui.errorArchive"));
      this.archiveTarget = null;
    } finally {
      this.saving = false;
    }
  }
  renderArchiveConfirm() {
    const t5 = (k2, p4) => erplora2().t(CATALOG2, k2, p4);
    const count = Number(this.archiveActive?.active_count ?? 0) || 0;
    return b2`<ion-modal .isOpen=${!!this.archiveTarget} @ionModalDidDismiss=${() => this.archiveTarget = null}>
      <ion-header class="ion-no-border">
        <ion-toolbar><ion-title>${t5("ui.archiveTitle")}</ion-title></ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <!-- Self-styled: ion-modal is reparented to <body>, so this component's CSS does not reach it. -->
        <ion-list lines="none">
          <ion-item>
            <ion-label class="ion-text-wrap">
              <b>${this.archiveTarget?.name ?? ""}</b> — ${t5("ui.archiveHint")}
            </ion-label>
          </ion-item>
          ${count > 0 ? b2`<ion-item>
                <ion-icon slot="start" name="calendar-outline" data-testid="services-list-archive-warning-icon" style=${ionTone2("text", "warning")}></ion-icon>
                <ion-label class="ion-text-wrap">${t5("ui.archiveWarnAppointments", { count })}</ion-label>
              </ion-item>` : A}
        </ion-list>
        <ion-button class="ion-margin-top" expand="block" data-testid="services-list-archive-submit" style=${ionTone2("solid", "danger")} ?disabled=${this.saving} @click=${() => this.confirmArchive()}>
          ${this.saving ? t5("ui.btnSaving") : t5("ui.archiveConfirm")}
        </ion-button>
        <ion-button expand="block" fill="outline" data-testid="services-list-archive-cancel" ?disabled=${this.saving} @click=${() => this.archiveTarget = null}>
          ${t5("ui.btnCancel")}
        </ion-button>
      </ion-content>
    </ion-modal>`;
  }
  /** pm#478: the refusal appears ABOVE the button that was pressed, at the foot of the form — on a
   *  phone that can leave it off the sheet. Bring it into view once it has painted itself: scrolled
   *  before, the banner still measures 0 px and ends up under the tab bar. */
  updated(changed) {
    super.updated(changed);
    if (changed.has("formError") && this.formError) void this.revealFormError();
  }
  async revealFormError() {
    const banner = this.renderRoot.querySelector('[data-testid="services-list-form-error"]');
    await banner?.updateComplete;
    banner?.scrollIntoView?.({ block: "center" });
  }
  // The view title is painted by the shell topbar: repeating it here showed it twice on screen.
  render() {
    const t5 = (k2) => erplora2().t(CATALOG2, k2);
    return b2`<div class="page">
        ${this.pageError ? b2`<ok-inline-feedback data-testid="services-list-page-error" tone="danger" icon="alert-circle-outline">${this.pageError}</ok-inline-feedback>` : A}
        ${this.ctrl?.error && !dataTableShowsLoadError() ? b2`<ok-inline-feedback data-testid="services-list-load-error" tone="danger" icon="alert-circle-outline">${this.ctrl.error}</ok-inline-feedback>` : A}
        <ok-data-table testid="services-list-table" .error=${this.ctrl?.error ?? ""} @retry=${() => Promise.all([this.ctrl?.load(), this.loadAux()])} .serverSide=${true} .fill=${true} .addable=${true} .views=${true} .cardTitle=${(row) => String(row.name ?? "")} .columns=${this.columns} .rows=${this.ctrl?.rows ?? []} .total=${this.ctrl?.total ?? 0} .page=${this.ctrl?.state.page ?? 0} .pageSize=${this.ctrl?.state.pageSize ?? 50} .sort=${this.ctrl?.state.sort} .sortDir=${this.ctrl?.state.dir ?? "asc"} .searchable=${true} .searchPlaceholder=${t5("ui.searchPlaceholder")} .actions=${this.actions} .rowClickable=${true} .emptyMessage=${this.ctrl?.loading ? t5("ui.loading") : t5("ui.empty")} @rowAction=${(e6) => this.onRowAction(e6)} @rowClick=${(e6) => this.onRowAction({ detail: { actionId: "edit", row: e6.detail.row } })}
 @pageChange=${(e6) => this.ctrl.setPage(e6.detail)} @pageSizeChange=${(e6) => this.ctrl.setPageSize(e6.detail)} @sortChange=${(e6) => this.ctrl.setSort(e6.detail.sort, e6.detail.dir)} @searchChange=${(e6) => this.ctrl.setSearch(e6.detail)} @filterChange=${(e6) => this.onFilterChange(e6.detail.col, e6.detail.value)}>
          <!-- Create form: ALWAYS projected (even with the panel shut); painted only on open, the
               toolbar «+» would slide out an empty panel. -->
          <form slot="create" class="form" data-testid="services-list-form" @submit=${(e6) => this.createService(e6)}>
            ${this.editingId && !this.editTitleInHeader ? b2`<ok-inline-feedback data-testid="services-list-editing" tone="info" icon="create-outline">
                  <b>${t5("ui.editingTitle")}</b> — ${this.newName}
                  <ion-button size="small" fill="clear" data-testid="services-list-edit-cancel" @click=${() => this.cancelEdit()}>${t5("ui.editingCancel")}</ion-button>
                </ok-inline-feedback>` : A}
            <ion-input data-testid="services-list-name" fill="outline" label-placement="floating" label=${t5("ui.colName")} .value=${this.newName} @ionInput=${(e6) => this.newName = e6.target.value}></ion-input>
            <ion-input data-testid="services-list-price" fill="outline" label-placement="floating" label=${t5("ui.colPrice")} type="text" inputmode="decimal" .value=${this.newPrice} @ionInput=${(e6) => this.newPrice = e6.target.value} @ionBlur=${() => this.normalisePrice()}></ion-input>
            <ion-input data-testid="services-list-duration" fill="outline" label-placement="floating" label=${t5("ui.colDuration")} type="number" step="1" .value=${this.newDuration} @ionInput=${(e6) => this.newDuration = e6.target.value}></ion-input>
            <!-- Both selects go WITHOUT a placeholder, on purpose (services#57): with a floating
                 label, Ionic lifts the label into the border gap as soon as the field has focus and
                 paints the placeholder INSIDE — two near-identical texts a few pixels apart. The
                 label alone says what the field is; a placeholder only fits if it adds something
                 (a format, an example), not if it repeats the name. -->
            <ion-select data-testid="services-list-category" fill="outline" label-placement="floating" label=${t5("ui.colCategory")} .value=${this.newCategory} @ionChange=${(e6) => this.newCategory = e6.target.value}>
              <ion-select-option value="">${t5("ui.optionNoCategory")}</ion-select-option>
              ${this.categories.map((c5) => b2`<ion-select-option .value=${c5.id}>${c5.name}</ion-select-option>`)}
            </ion-select>
            <ion-select data-testid="services-list-tax" fill="outline" label-placement="floating" label=${t5("ui.colTax")} .value=${this.newTaxRateId} @ionChange=${(e6) => this.newTaxRateId = e6.target.value}>
              ${this.taxOptions()}
            </ion-select>
            <!-- Without tax categories creating is impossible (the category is required): say where
                 to fix it, instead of leaving an empty dropdown with no explanation. -->
            ${this.taxRates.length === 0 ? b2`<ok-inline-feedback data-testid="services-list-tax-missing" tone="warning" icon="alert-circle-outline">${t5("ui.taxCategoriesMissing")}</ok-inline-feedback>` : A}
            <!-- pm#478: the refusal travels WITH the form — on a phone the panel is a full-screen
                 sheet and a banner on the page underneath it is never seen. -->
            ${this.formError ? b2`<ok-inline-feedback data-testid="services-list-form-error" tone="danger" icon="alert-circle-outline">${this.formError}</ok-inline-feedback>` : A}
            <ion-button type="submit" data-testid="services-list-submit" ?disabled=${this.saving || !this.newName || !this.newTaxRateId}>${this.saving ? t5("ui.btnSaving") : this.editingId ? t5("ui.btnSave") : t5("ui.btnAdd")}</ion-button>
          </form>
        </ok-data-table>
        ${this.renderArchiveConfirm()}
      </div>`;
  }
};
__decorateClass([
  r5()
], ErpServicesList.prototype, "categories", 2);
__decorateClass([
  r5()
], ErpServicesList.prototype, "taxRates", 2);
__decorateClass([
  r5()
], ErpServicesList.prototype, "formError", 2);
__decorateClass([
  r5()
], ErpServicesList.prototype, "pageError", 2);
__decorateClass([
  r5()
], ErpServicesList.prototype, "newName", 2);
__decorateClass([
  r5()
], ErpServicesList.prototype, "newPrice", 2);
__decorateClass([
  r5()
], ErpServicesList.prototype, "newDuration", 2);
__decorateClass([
  r5()
], ErpServicesList.prototype, "newCategory", 2);
__decorateClass([
  r5()
], ErpServicesList.prototype, "newTaxRateId", 2);
__decorateClass([
  r5()
], ErpServicesList.prototype, "saving", 2);
__decorateClass([
  r5()
], ErpServicesList.prototype, "tick", 2);
__decorateClass([
  r5()
], ErpServicesList.prototype, "showingArchived", 2);
__decorateClass([
  r5()
], ErpServicesList.prototype, "editingId", 2);
__decorateClass([
  r5()
], ErpServicesList.prototype, "editTitleInHeader", 2);
__decorateClass([
  r5()
], ErpServicesList.prototype, "archiveTarget", 2);
__decorateClass([
  r5()
], ErpServicesList.prototype, "archiveActive", 2);
define("erp-services-list", ErpServicesList);

// @erplora/outfitkit/dist/ok-status-pill.js
var __defProp4 = Object.defineProperty;
var __decorateClass4 = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i7 = decorators.length - 1, decorator; i7 >= 0; i7--)
    if (decorator = decorators[i7])
      result = decorator(target, key, result) || result;
  if (result) __defProp4(target, key, result);
  return result;
};
var OkStatusPill = class extends i3 {
  constructor() {
    super(...arguments);
    this.tone = "neutral";
    this.dot = false;
    this.size = "md";
  }
  static {
    this.styles = i`
    :host {
      /* Vars overridable (estilo Ionic), default = cadena --ok-* → --ion-* → hex.
         --tone-color (base: fondo/punto/icono) y --tone-shade (texto) se reasignan por tone abajo. */
      --tone-color: var(--ok-medium, var(--ion-color-medium, #5f5f5f));
      --tone-shade: var(--ok-medium, var(--ion-color-medium-shade, #545454));
      --background-opacity: var(--ok-pill-bg-opacity, 0.14);
      --border-radius: var(--ok-pill-radius, 999px);
      --font: var(--ok-font, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif);

      /* Inline: el pill vive en celdas de tabla, cabeceras y listados. */
      display: inline-flex;
      vertical-align: middle;
      font-family: var(--font);
      box-sizing: border-box;
    }

    /* Mapa de tonos → color Ionic (base + shade para el texto). */
    :host([tone='success']) {
      --tone-color: var(--ok-success, var(--ion-color-success, #2dd55b));
      --tone-shade: var(--ok-success, var(--ion-color-success-shade, #28bb50));
    }
    :host([tone='warning']) {
      --tone-color: var(--ok-warning, var(--ion-color-warning, #ffc409));
      --tone-shade: var(--ok-warning-shade, var(--ion-color-warning-shade, #e0ac08));
    }
    :host([tone='danger']) {
      --tone-color: var(--ok-danger, var(--ion-color-danger, #c5000f));
      --tone-shade: var(--ok-danger, var(--ion-color-danger-shade, #ad000d));
    }
    :host([tone='info']) {
      --tone-color: var(--ok-info, var(--ion-color-secondary, #0163aa));
      --tone-shade: var(--ok-info, var(--ion-color-secondary-shade, #015896));
    }
    :host([tone='primary']) {
      --tone-color: var(--ok-primary, var(--ion-color-primary, #3880ff));
      --tone-shade: var(--ok-primary, var(--ion-color-primary-shade, #3171e0));
    }
    /* neutral / sin tono → medium (default ya aplicado en :host). */

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 0.4em;
      padding: 0.25em 0.7em;
      border-radius: var(--border-radius);
      /* Fondo tonal: el color del tono con baja opacidad. */
      background: color-mix(in srgb, var(--tone-color) calc(var(--background-opacity) * 100%), transparent);
      color: var(--ok-pill-color, var(--tone-shade));
      font-size: 0.8125rem;
      font-weight: 600;
      line-height: 1.4;
      white-space: nowrap;
    }
    :host([size='sm']) .pill {
      font-size: 0.72rem;
      padding: 0.2em 0.6em;
    }

    ion-icon {
      flex: 0 0 auto;
      font-size: 1.05em;
      pointer-events: none;
    }

    /* Punto de color (estilo Linear) en vez de icono. */
    .dot {
      flex: 0 0 auto;
      width: 0.5em;
      height: 0.5em;
      border-radius: 50%;
      background: var(--tone-color);
    }
  `;
  }
  render() {
    return b2`
      <span class="pill" part="pill">
        ${this.dot ? b2`<span class="dot" part="dot" aria-hidden="true"></span>` : this.icon ? b2`<ion-icon .icon=${okIcon(this.icon)} aria-hidden="true"></ion-icon>` : null}
        <slot>${this.label ?? ""}</slot>
      </span>
    `;
  }
};
__decorateClass4([
  n4({ type: String, reflect: true })
], OkStatusPill.prototype, "tone");
__decorateClass4([
  n4({ type: String })
], OkStatusPill.prototype, "label");
__decorateClass4([
  n4({ type: String })
], OkStatusPill.prototype, "icon");
__decorateClass4([
  n4({ type: Boolean, reflect: true })
], OkStatusPill.prototype, "dot");
__decorateClass4([
  n4({ type: String, reflect: true })
], OkStatusPill.prototype, "size");
define("ok-status-pill", OkStatusPill);

// @erplora/module-services/ui/components/erp-services-packages/erp-services-packages.ts
var CATALOG3 = { es: es_default, en: en_default };
var SESSION_SCALE = 1e6;
var PERCENT_DECIMALS = 2;
var EMPTY_FORM = { name: "", discountType: "percentage", discountValue: "", fixedPrice: "", validityDays: "", maxUses: "" };
function erplora3() {
  const c5 = globalThis.erplora;
  if (!c5) throw new Error("erplora SDK no inicializado por el shell");
  return c5;
}
function can3(permission) {
  const client = erplora3();
  return typeof client.hasPermission === "function" ? client.hasPermission(permission) : true;
}
function nameOf(answer, id) {
  const list = Array.isArray(answer) ? answer : Array.isArray(answer?.rows) ? answer.rows : [];
  const row = list.find((r6) => String(r6?.id ?? "") === id);
  const name = String(row?.name ?? "").trim();
  return name || null;
}
function decimals() {
  const d3 = erplora3().currencyDecimals;
  return typeof d3 === "number" ? d3 : 2;
}
function readMoney(typed) {
  const c5 = erplora3();
  const d3 = decimals();
  const raw = String(typed ?? "");
  const read = parseMoneyInput(raw, d3, { currency: c5.currency || void 0, locale: c5.locale });
  if (read.ok) {
    return read.minor !== null && read.minor < 0 ? { ok: false, key: "ui.errNegativeAmount" } : { ok: true, minor: read.minor };
  }
  if (read.code === "ambiguous_amount") {
    return {
      ok: false,
      key: "ui.errAmbiguousAmount",
      params: {
        typed: raw.trim(),
        grouped: formatMoneyInput(read.readings.grouped, d3, c5.locale),
        decimal: formatMoneyInput(read.readings.decimal, d3, c5.locale)
      }
    };
  }
  return { ok: false, key: "ui.errNotAnAmount" };
}
function toMoneyText(minor) {
  return formatMoneyInput(Number(minor) || 0, decimals(), erplora3().locale);
}
function toBasisPoints(v3) {
  const s5 = String(v3 ?? "").trim().replace(",", ".");
  return s5 ? majorToMinor(s5, PERCENT_DECIMALS) : 0;
}
function formatPercent(bp) {
  return Number(minorToMajor(bp || 0, PERCENT_DECIMALS)).toLocaleString(erplora3().locale, { maximumFractionDigits: PERCENT_DECIMALS });
}
function toIntOrNull(v3) {
  const s5 = String(v3 ?? "").trim();
  if (!s5) return null;
  const n6 = Number.parseInt(s5, 10);
  return Number.isFinite(n6) ? n6 : null;
}
var ErpServicesPackages = class extends i3 {
  constructor() {
    super(...arguments);
    this.form = { ...EMPTY_FORM };
    this.items = [{ serviceId: "", sessions: "1" }];
    this.services = [];
    this.saving = false;
    this.formError = "";
    this.pageError = "";
    this.editingId = null;
    this.editTitleInHeader = false;
    /** pm#459: generation of the last edit opening; a stale wait (package fetch, table render) of an
     *  earlier one sees a newer number and gives up, so the LAST tap wins. */
    this.editSeq = 0;
    this.deleteTarget = null;
    this.movementsOf = null;
    this.movements = [];
    this.movementsTotal = 0;
    this.movementsLoading = false;
    this.movementsError = "";
    this.orphansOpen = false;
    this.orphans = [];
    this.orphansTotal = 0;
    this.orphansLoading = false;
    this.orphansError = "";
    this.customerNames = /* @__PURE__ */ new Map();
    this.userNames = null;
    this.grantsOf = null;
    this.grants = [];
    this.grantsTotal = 0;
    this.grantsLoading = false;
    this.grantsError = "";
    this.voidTarget = null;
    this.voidReason = "";
    this.voiding = false;
    this.voidError = "";
    this.adjustTarget = null;
    this.adjustUses = "";
    this.adjustDays = "";
    this.adjustReason = "";
    this.adjustDirection = "add";
    this.adjusting = false;
    this.adjustError = "";
    this.onLocaleChange = () => this.requestUpdate();
  }
  static {
    this.styles = i`
    :host { display: flex; flex-direction: column; height: 100%; min-height: 0; font-family: system-ui, sans-serif; color: var(--ion-text-color, #1c1b18); }
    .page { display: flex; flex-direction: column; min-height: 0; flex: 1 1 auto; }
    .page > ok-data-table { flex: 1 1 auto; min-height: 0; }
    .form { display: flex; flex-direction: column; gap: 0.7rem; }
    .form ion-button[type='submit'] { align-self: flex-end; }
    .line { display: grid; grid-template-columns: 1fr 5.5rem auto; gap: 0.4rem; align-items: center; }
    .lines-title { font-size: 0.85rem; font-weight: 600; margin: 0.3rem 0 0; }
    .movement h3 { display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap; }
    .movement .refund { font-size: 0.82rem; opacity: 0.85; }
    .more { font-size: 0.82rem; opacity: 0.75; margin: 0.6rem 0 0; text-align: center; }
  `;
  }
  get columns() {
    const t5 = (k2) => erplora3().t(CATALOG3, k2);
    return [
      { key: "name", header: t5("ui.colName"), sortable: true, filterable: true, filterType: "text" },
      {
        key: "discount_type",
        header: t5("ui.colDiscount"),
        sortable: true,
        format: (r6) => r6.discount_type === "fixed" ? `-${erplora3().formatMoney(Number(r6.discount_amount_cents) || 0)}` : `-${formatPercent(Number(r6.discount_percent_bp) || 0)} %`
      },
      {
        key: "fixed_price",
        header: t5("ui.colFixedPrice"),
        align: "right",
        sortable: true,
        format: (r6) => r6.fixed_price == null || r6.fixed_price === "" ? "\u2014" : erplora3().formatMoney(Number(r6.fixed_price) || 0)
      },
      { key: "items", header: t5("ui.colItems"), align: "right", sortable: true },
      {
        key: "is_active",
        header: t5("ui.colStatus"),
        sortable: true,
        filterable: true,
        filterType: "select",
        options: [{ value: "1", label: t5("ui.status.active") }, { value: "0", label: t5("ui.status.inactive") }],
        format: (r6) => Number(r6.is_active) ? t5("ui.status.active") : t5("ui.status.inactive")
      }
    ];
  }
  get actions() {
    const t5 = (k2) => erplora3().t(CATALOG3, k2);
    return [
      ...can3("services.change_package") ? [{ id: "edit", label: t5("ui.actionEdit"), icon: "create-outline" }] : [],
      // The voucher's ledger. Gated by the same permission as the balance, because that is what
      // it is: the movements behind a balance. Read-only — returning a session is `sales`' return
      // flow, not a button on the catalogue screen.
      ...can3("services.view_package_balance") ? [{ id: "movements", label: t5("ui.actionMovements"), icon: "time-outline" }] : [],
      // Who bought this voucher (services#82) — the same permission, because it shows the same
      // balances; voiding one of those sales asks for its own permission on top.
      ...can3("services.view_package_balance") ? [{ id: "grants", label: t5("ui.actionGrants"), icon: "people-outline" }] : [],
      ...can3("services.delete_package") ? [{ id: "delete", label: t5("ui.actionDelete"), icon: "trash-outline", color: "danger" }] : []
    ];
  }
  async connectedCallback() {
    super.connectedCallback();
    window.addEventListener("erplora:locale-changed", this.onLocaleChange);
    this.ctrl = createListController(erplora3(), "services.packages.list", () => this.requestUpdate(), {
      pageSize: 50,
      sort: "name",
      dir: "asc"
    });
    await Promise.all([this.ctrl.load(), this.loadServices()]);
    try {
      const off1 = erplora3().on("services.package.created", () => this.ctrl.load());
      const off2 = erplora3().on("services.package.updated", () => this.ctrl.load());
      const off3 = erplora3().on("services.package.deleted", () => this.ctrl.load());
      this.unsub = () => {
        off1();
        off2();
        off3();
      };
    } catch {
    }
  }
  disconnectedCallback() {
    window.removeEventListener("erplora:locale-changed", this.onLocaleChange);
    super.disconnectedCallback();
    this.unsub?.();
  }
  async loadServices() {
    try {
      this.services = await erplora3().queryAll("services.services.list", { sort: "name", dir: "asc" }) ?? [];
    } catch {
      this.services = [];
    }
  }
  dataTable() {
    return this.renderRoot.querySelector("ok-data-table");
  }
  /** pm#450: the table's «Add» emits no event and keeps our form state; after an edit it would
   *  show the edited record under a «New» header, and the submit would UPDATE it. */
  onTableClick(e6) {
    const addId = "services-packages-table-add";
    if (!e6.composedPath().some((n6) => n6 instanceof HTMLElement && n6.dataset.testid === addId)) return;
    if (this.editingId) this.cancelEdit();
    else this.editSeq++;
  }
  /** Wired natively, not with a Lit `@click` on the tag: `<ok-data-table>` carries `testid`, not
   *  `data-testid` (outfitkit#143), and a template binding would read as an action element that
   *  demands one. */
  firstUpdated() {
    const table = this.renderRoot.querySelector("ok-data-table");
    table?.addEventListener("click", (e6) => this.onTableClick(e6));
    table?.addEventListener("panelClose", () => this.editSeq++);
  }
  addItem() {
    this.items = [...this.items, { serviceId: "", sessions: "1" }];
  }
  removeItem(i7) {
    this.items = this.items.filter((_2, idx) => idx !== i7);
    if (this.items.length === 0) this.items = [{ serviceId: "", sessions: "1" }];
  }
  setItem(i7, patch) {
    this.items = this.items.map((it, idx) => idx === i7 ? { ...it, ...patch } : it);
  }
  async onRowAction(ev) {
    const { actionId, row } = ev.detail;
    const p4 = row;
    if (actionId === "edit" && can3("services.change_package")) {
      const seq = ++this.editSeq;
      this.formError = "";
      let full = row;
      try {
        const rows = await erplora3().query("services.packages.get", { package_id: p4.id });
        if (Array.isArray(rows) && rows[0]) full = rows[0];
      } catch {
      }
      if (seq !== this.editSeq) return;
      const type = String(full.discount_type ?? "percentage");
      this.editingId = p4.id;
      this.form = {
        name: String(full.name ?? ""),
        discountType: type,
        discountValue: type === "fixed" ? toMoneyText(full.discount_amount_cents) : String(minorToMajor(Number(full.discount_percent_bp) || 0, PERCENT_DECIMALS)),
        fixedPrice: full.fixed_price == null || full.fixed_price === "" ? "" : toMoneyText(full.fixed_price),
        validityDays: full.validity_days == null ? "" : String(full.validity_days),
        maxUses: full.max_uses == null ? "" : String(full.max_uses)
      };
      const title = `${erplora3().t(CATALOG3, "ui.editingPackageTitle")} \u2014 ${this.form.name}`;
      const table = this.dataTable();
      table?.open("edit", { title });
      await table?.updateComplete;
      if (seq !== this.editSeq) return;
      this.editTitleInHeader = table?.shadowRoot?.querySelector('[role="dialog"]')?.getAttribute("aria-label") === title;
    } else if (actionId === "movements" && can3("services.view_package_balance")) {
      await this.openMovements(p4);
    } else if (actionId === "grants" && can3("services.view_package_balance")) {
      await this.openGrants(p4);
    } else if (actionId === "delete" && can3("services.delete_package")) {
      this.deleteTarget = p4;
      this.pageError = "";
    }
  }
  /** Open the voucher's ledger and load its FIRST page. The three states are painted, not only the
   *  happy one. Reopening starts from the top: the sheet is a fresh read of the ledger, never the
   *  previous one with a second copy stacked underneath. */
  async openMovements(p4) {
    this.movementsOf = { id: p4.id, name: p4.name };
    this.forgetNames();
    this.movements = [];
    this.movementsTotal = 0;
    this.movementsError = "";
    await this.loadMovementsPage();
  }
  /**
   * One more page of the ledger, ADDED to what is on screen (services#76).
   *
   * 🔴 It is `queryPage`, not `queryAll`, and that is the whole issue: `queryAll` walks EVERY page
   * of a list query and hands back the lot. For a voucher created last week that is the same
   * thing; for the star voucher of a salon after two years — N customers × `max_uses` sessions,
   * plus the releases, the expiries and the refunds, which count too because the query includes
   * the soft-deleted rows on purpose — it is hundreds or thousands of rows in one response, on a
   * tablet. The page size is the module's own (`list.page_size` in the manifest): the screen does
   * not repeat the number, it just asks for what comes after what it already has.
   */
  async loadMoreMovements() {
    if (this.movementsLoading || this.movements.length >= this.movementsTotal) return;
    await this.loadMovementsPage();
  }
  async loadMovementsPage() {
    const target = this.movementsOf;
    if (!target) return;
    this.movementsLoading = true;
    this.movementsError = "";
    try {
      const page = await erplora3().queryPage("services.packages.redemption_history", {
        offset: this.movements.length,
        params: { package_id: target.id }
      });
      if (this.movementsOf !== target) return;
      const rows = page?.rows ?? [];
      this.movements = [...this.movements, ...rows];
      this.movementsTotal = page?.total ?? this.movements.length;
      this.resolveNames(
        rows.map((m4) => m4.customer_id),
        rows.map((m4) => m4.movement === "adjusted" ? m4.created_by ?? null : m4.refunded_by)
      );
    } catch (e6) {
      if (this.movementsOf !== target) return;
      this.movementsError = domainMessage(e6, erplora3().locale, erplora3().t(CATALOG3, "ui.errorMovements"));
    } finally {
      if (this.movementsOf === target) this.movementsLoading = false;
    }
  }
  /**
   * Open the rescue drawer (services#81).
   *
   * It reloads from scratch every time rather than keeping what it had: the set only changes when a
   * customer is deleted somewhere else in the hub, so a stale list is the one thing this screen
   * cannot afford — it exists to be the single place where this money is visible.
   */
  async openOrphans() {
    this.orphansOpen = true;
    this.orphans = [];
    this.orphansTotal = 0;
    this.orphansError = "";
    await this.loadOrphansPage();
  }
  /** One more page, ADDED to what is on screen — same contract as the movements ledger. */
  async loadMoreOrphans() {
    if (this.orphansLoading || this.orphans.length >= this.orphansTotal) return;
    await this.loadOrphansPage();
  }
  async loadOrphansPage() {
    this.orphansLoading = true;
    this.orphansError = "";
    try {
      const page = await erplora3().queryPage("services.packages.orphans", {
        offset: this.orphans.length
      });
      if (!this.orphansOpen) return;
      this.orphans = [...this.orphans, ...page?.rows ?? []];
      this.orphansTotal = page?.total ?? this.orphans.length;
    } catch (e6) {
      this.orphansError = domainMessage(e6, erplora3().locale, erplora3().t(CATALOG3, "ui.errorOrphans"));
    } finally {
      this.orphansLoading = false;
    }
  }
  /** Open the sales of a voucher (services#82) from its FIRST page — same contract as the ledger:
   *  a page at a time, three states painted, a reopening reads again instead of stacking. */
  async openGrants(p4) {
    this.grantsOf = { id: p4.id, name: p4.name };
    this.forgetNames();
    this.voidTarget = null;
    this.adjustTarget = null;
    await this.reloadGrants();
  }
  async reloadGrants() {
    this.grants = [];
    this.grantsTotal = 0;
    this.grantsError = "";
    await this.loadGrantsPage();
  }
  async loadMoreGrants() {
    if (this.grantsLoading || this.grants.length >= this.grantsTotal) return;
    await this.loadGrantsPage();
  }
  async loadGrantsPage() {
    const target = this.grantsOf;
    if (!target) return;
    this.grantsLoading = true;
    this.grantsError = "";
    try {
      const page = await erplora3().queryPage("services.packages.grants", {
        offset: this.grants.length,
        params: { package_id: target.id }
      });
      if (this.grantsOf !== target) return;
      const rows = page?.rows ?? [];
      this.grants = [...this.grants, ...rows];
      this.grantsTotal = page?.total ?? this.grants.length;
      this.resolveNames(rows.map((g3) => g3.customer_id), rows.map((g3) => g3.voided_by));
    } catch (e6) {
      if (this.grantsOf !== target) return;
      this.grantsError = domainMessage(e6, erplora3().locale, erplora3().t(CATALOG3, "ui.errorGrants"));
    } finally {
      if (this.grantsOf === target) this.grantsLoading = false;
    }
  }
  forgetNames() {
    this.customerNames = /* @__PURE__ */ new Map();
    this.userNames = null;
  }
  /**
   * Resolve the names of a page just painted (services#121), through the doors the catalogue
   * already uses — no contract of its own:
   *   * customers through `customers.get` on the OPTIONAL door (ADR-0127): `services` does not
   *     depend on `customers`, so «not installed» answers `undefined` and the id stays. Asked once
   *     per distinct id not already known, and not at all without `customers.view_customer` (the
   *     runtime would refuse it anyway);
   *   * employees through `hub.users.list`, the core's reserved namespace — the same door
   *     `kitchen`, `sales` and `appointments` use — once per opening, and only if someone is named.
   * Every failure degrades to the id: the sheet never breaks for want of a name.
   */
  resolveNames(customerIds, userIds) {
    const known = this.customerNames;
    const pending = [...new Set(customerIds.filter((id) => !!id))].filter((id) => !known.has(id));
    if (pending.length) {
      const client = erplora3();
      const allowed = can3("customers.view_customer") && typeof client.queryOptional === "function";
      this.customerNames = new Map([...known, ...pending.map((id) => [id, allowed ? void 0 : null])]);
      if (allowed) {
        for (const id of pending) {
          void client.queryOptional("customers.get", { customer_id: id }).then((answer) => nameOf(answer, id), () => null).then((name) => {
            this.customerNames = new Map(this.customerNames).set(id, name);
          });
        }
      }
    }
    if (this.userNames === null && userIds.some((id) => !!id)) {
      this.userNames = void 0;
      void erplora3().query("hub.users.list").then(
        (answer) => {
          const names = /* @__PURE__ */ new Map();
          for (const person of Array.isArray(answer) ? answer : []) {
            const id = String(person?.id ?? "");
            const name = nameOf([person], id);
            if (id && name) names.set(id, name);
          }
          return names;
        },
        () => /* @__PURE__ */ new Map()
      ).then((names) => {
        this.userNames = names;
      });
    }
  }
  /** What to paint for a customer id: its name, «loading name…» while on its way, else the id. */
  customerLabel(id) {
    const name = this.customerNames.get(id);
    if (name === void 0 && this.customerNames.has(id)) return erplora3().t(CATALOG3, "ui.nameLoading");
    return name ?? id;
  }
  /** Same for an employee (who voided, who gave a session back); `—` when nobody is recorded. */
  userLabel(id) {
    if (!id) return "\u2014";
    if (this.userNames === void 0) return erplora3().t(CATALOG3, "ui.nameLoading");
    return this.userNames?.get(id) ?? id;
  }
  closeGrants() {
    this.grantsOf = null;
    this.voidTarget = null;
    this.adjustTarget = null;
  }
  /** Ask to void a sale: the sheet swaps its list for the confirmation, reason still blank. */
  askVoid(grant) {
    this.adjustTarget = null;
    this.voidTarget = grant;
    this.voidReason = "";
    this.voidError = "";
  }
  cancelVoid() {
    this.voidTarget = null;
    this.voidError = "";
  }
  /**
   * Void the sale being confirmed. The reason is mandatory — a void is an audit fact — so a blank
   * one is not even sent (the handler refuses it too). On success the list is READ AGAIN rather
   * than patched: the server is who says what the sale looks like now. A refusal stays on the
   * confirmation, where the person is looking, with the module's own sentence for its code.
   */
  async confirmVoid() {
    const target = this.voidTarget;
    const reason = this.voidReason.trim();
    if (!target || !reason || this.voiding || !can3("services.void_grant")) return;
    this.voiding = true;
    this.voidError = "";
    try {
      await erplora3().command("services.packages.void_grant", { grant_id: target.grant_id, reason });
      if (this.voidTarget !== target) return;
      this.voidTarget = null;
      await this.reloadGrants();
    } catch (e6) {
      if (this.voidTarget !== target) return;
      this.voidError = domainMessage(e6, erplora3().locale, erplora3().t(CATALOG3, "ui.errorVoidGrant"));
    } finally {
      this.voiding = false;
    }
  }
  /** Ask to adjust a sale (services#118): the sheet swaps its list for the courtesy form, blank. */
  askAdjust(grant) {
    this.voidTarget = null;
    this.adjustTarget = grant;
    this.adjustDirection = "add";
    this.adjustUses = "";
    this.adjustDays = "";
    this.adjustReason = "";
    this.adjustError = "";
  }
  cancelAdjust() {
    this.adjustTarget = null;
    this.adjustError = "";
  }
  /**
   * What the form would send: whole numbers, 0 for a blank field AND for a half the voucher cannot
   * take (no sessions on an unlimited voucher, no days on one that never expires — the field is not
   * even painted, but a value typed for another sale must not travel). `null` when a field is not a
   * whole number from 0 to its limit (100 sessions, 366 days) or nothing is added: the button stays
   * disabled. Removing sessions (services#119) travels NEGATIVE and its limit is what the customer
   * has left — the handler and the write refuse more as `services.grant_adjust_below_used`.
   */
  adjustAmounts() {
    const target = this.adjustTarget;
    if (!target) return null;
    const read = (raw, allowed, max) => {
      if (!allowed) return 0;
      const text = raw.trim();
      if (!text) return 0;
      return /^\d+$/.test(text) && Number(text) <= max ? Number(text) : null;
    };
    const removing = this.adjustDirection === "remove";
    const uses = read(this.adjustUses, target.max_uses != null, removing ? this.removableUses(target) : 100);
    const days = read(this.adjustDays, target.expires_at != null, 366);
    if (uses === null || days === null || uses + days === 0) return null;
    return { uses: removing ? -uses : uses, days };
  }
  /** Most sessions a correction may take from a sale: what is left, and never past 100 at once. */
  removableUses(g3) {
    return Math.min(100, Math.max(0, Number(g3.remaining) || 0));
  }
  /**
   * Give the courtesy. The reason is mandatory and something must be added — a blank form is not
   * even sent (the handler refuses it too). On success the list is READ AGAIN: the server says what
   * the voucher is worth now. A refusal stays on the form with the module's own sentence.
   */
  async confirmAdjust() {
    const target = this.adjustTarget;
    const reason = this.adjustReason.trim();
    const amounts = this.adjustAmounts();
    if (!target || !reason || !amounts || this.adjusting || !can3("services.adjust_grant")) return;
    this.adjusting = true;
    this.adjustError = "";
    try {
      await erplora3().command("services.packages.adjust_grant", {
        grant_id: target.grant_id,
        uses_delta: amounts.uses,
        days_delta: amounts.days,
        reason
      });
      if (this.adjustTarget !== target) return;
      this.adjustTarget = null;
      await this.reloadGrants();
    } catch (e6) {
      if (this.adjustTarget !== target) return;
      this.adjustError = domainMessage(e6, erplora3().locale, erplora3().t(CATALOG3, "ui.errorAdjustGrant"));
    } finally {
      this.adjusting = false;
    }
  }
  /** On leaving a money field: rewritten in the hub's notation when readable, left EXACTLY as
   *  typed when not — the refusal on save quotes it back (pm#521). A percentage is not money and
   *  never comes through here. */
  normaliseMoney(typed) {
    const c5 = erplora3();
    return normaliseMoneyInput(String(typed ?? ""), decimals(), c5.locale, c5.currency || void 0);
  }
  /** Back to a clean CREATE form. */
  cancelEdit() {
    this.editSeq++;
    this.editingId = null;
    this.form = { ...EMPTY_FORM };
    this.items = [{ serviceId: "", sessions: "1" }];
    this.formError = "";
  }
  /**
   * The two money fields of the header, read — or the sentence of why one cannot be used, naming
   * the field (there are two on the form). Empty closed price = `null` (the lines minus the
   * discount, never a free voucher); empty fixed discount = 0 (no discount).
   */
  readMoneyFields() {
    const c5 = erplora3();
    const fixed = this.form.discountType === "fixed";
    const discount = fixed ? readMoney(this.form.discountValue) : { ok: true, minor: null };
    if (!discount.ok) return { ok: false, message: `${c5.t(CATALOG3, "ui.colDiscountAmount")}: ${c5.t(CATALOG3, discount.key, discount.params)}` };
    const fixedPrice = readMoney(this.form.fixedPrice);
    if (!fixedPrice.ok) return { ok: false, message: `${c5.t(CATALOG3, "ui.colFixedPrice")}: ${c5.t(CATALOG3, fixedPrice.key, fixedPrice.params)}` };
    return { ok: true, discount: fixed ? discount.minor ?? 0 : null, fixedPrice: fixedPrice.minor };
  }
  /** The header fields as the commands want them: percent OR minor units by `discount_type`. */
  headerPayload(money) {
    const fixed = this.form.discountType === "fixed";
    return {
      name: this.form.name.trim(),
      discount_type: fixed ? "fixed" : "percentage",
      discount_percent_bp: fixed ? null : toBasisPoints(this.form.discountValue),
      discount_amount_cents: money.discount,
      fixed_price: money.fixedPrice,
      validity_days: toIntOrNull(this.form.validityDays),
      max_uses: toIntOrNull(this.form.maxUses)
    };
  }
  /** Submit: create (header + lines) OR update (header, partial door `records.package.patch`). */
  async save(ev) {
    ev.preventDefault();
    const required = this.editingId ? "services.change_package" : "services.add_package";
    if (!can3(required) || !this.form.name.trim()) return;
    const t5 = (k2) => erplora3().t(CATALOG3, k2);
    const money = this.readMoneyFields();
    if (!money.ok) {
      this.formError = money.message;
      return;
    }
    const header = this.headerPayload(money);
    const lines = this.items.filter((l3) => l3.serviceId).map((l3) => ({ service_id: l3.serviceId, quantity: Math.max(1, Math.round(Number(l3.sessions) || 1)) * SESSION_SCALE }));
    if (!this.editingId && lines.length === 0) {
      this.formError = t5("ui.errorPackageNoLines");
      return;
    }
    this.saving = true;
    this.formError = "";
    this.pageError = "";
    try {
      if (this.editingId) {
        await erplora3().command("services.packages.update", {
          package_id: this.editingId,
          ...header,
          discount_percent_bp: header.discount_percent_bp ?? 0,
          discount_amount_cents: header.discount_amount_cents ?? 0
        });
      } else {
        await erplora3().command("services.packages.create", { ...header, items: lines });
      }
      this.cancelEdit();
      this.dataTable()?.close();
      await this.ctrl.load();
    } catch (e6) {
      this.formError = domainMessage(e6, erplora3().locale, t5("ui.errorSavePackage"));
    } finally {
      this.saving = false;
    }
  }
  async confirmDelete() {
    const target = this.deleteTarget;
    if (!target || !can3("services.delete_package")) return;
    this.saving = true;
    try {
      await erplora3().command("services.packages.delete", { package_id: target.id });
      this.deleteTarget = null;
      await this.ctrl.load();
    } catch (e6) {
      this.pageError = domainMessage(e6, erplora3().locale, erplora3().t(CATALOG3, "ui.errorDeletePackage"));
      this.deleteTarget = null;
    } finally {
      this.saving = false;
    }
  }
  renderDeleteConfirm() {
    const t5 = (k2, p4) => erplora3().t(CATALOG3, k2, p4);
    return b2`<ion-modal .isOpen=${!!this.deleteTarget} @ionModalDidDismiss=${() => this.deleteTarget = null}>
      <ion-header class="ion-no-border">
        <ion-toolbar><ion-title>${t5("ui.deletePackageTitle")}</ion-title></ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <!-- Self-styled: ion-modal is reparented to <body>, this component's CSS does not reach it. -->
        <ion-list lines="none">
          <ion-item>
            <ion-label class="ion-text-wrap"><b>${this.deleteTarget?.name ?? ""}</b> — ${t5("ui.deletePackageHint", { count: Number(this.deleteTarget?.items ?? 0) || 0 })}</ion-label>
          </ion-item>
        </ion-list>
        <ion-button class="ion-margin-top" expand="block" data-testid="services-packages-delete-submit" style=${ionTone2("solid", "danger")} ?disabled=${this.saving} @click=${() => this.confirmDelete()}>${t5("ui.actionDelete")}</ion-button>
        <ion-button expand="block" fill="outline" data-testid="services-packages-delete-cancel" ?disabled=${this.saving} @click=${() => this.deleteTarget = null}>${t5("ui.btnCancel")}</ion-button>
      </ion-content>
    </ion-modal>`;
  }
  /** A day (an expiry), in the hub's locale. */
  day(value) {
    if (!value) return "\u2014";
    const d3 = new Date(value);
    return Number.isNaN(d3.getTime()) ? value : d3.toLocaleDateString(erplora3().locale, { dateStyle: "short" });
  }
  /** A movement's date, in the hub's locale. An unparseable or absent stamp prints as «—». */
  stamp(value) {
    if (!value) return "\u2014";
    const d3 = new Date(value);
    return Number.isNaN(d3.getTime()) ? value : d3.toLocaleString(erplora3().locale, { dateStyle: "short", timeStyle: "short" });
  }
  /** The colour of a movement. `expired` shares `released`'s neutral tone — the session is back
   *  either way — and only the LABEL tells a timeout from the cashier's undo (migration 014). */
  movementTone(movement) {
    switch (movement) {
      case "refunded":
        return "warning";
      case "released":
      case "expired":
        return "neutral";
      case "held":
      case "adjusted":
        return "info";
      default:
        return "success";
    }
  }
  renderMovement(m4) {
    const t5 = (k2, p4) => erplora3().t(CATALOG3, k2, p4);
    const refunded = m4.movement === "refunded";
    if (m4.movement === "adjusted") {
      const uses = Number(m4.uses_delta) || 0;
      const days = Number(m4.days_delta) || 0;
      const corrected = uses < 0;
      return b2`<ion-item class="movement">
        <ion-label class="ion-text-wrap">
          <h3>
            <ok-status-pill size="sm" tone=${this.movementTone(m4.movement)}>${t5(corrected ? "ui.movement.corrected" : "ui.movement.adjusted")}</ok-status-pill>
            ${corrected ? t5("ui.movementCorrected", { uses: -uses, days }) : t5("ui.movementAdjusted", { uses, days })}
          </h3>
          <p>${this.stamp(m4.redeemed_at)} · ${t5("ui.movementCustomer")}: ${this.customerLabel(m4.customer_id)}</p>
          <p class="refund">${t5(corrected ? "ui.movementCorrectedBy" : "ui.movementAdjustedBy", { who: this.userLabel(m4.created_by ?? null) })}${m4.adjust_reason ? b2` · ${m4.adjust_reason}` : A}</p>
        </ion-label>
      </ion-item>`;
    }
    return b2`<ion-item class="movement">
      <ion-label class="ion-text-wrap">
        <h3>
          <ok-status-pill size="sm" tone=${this.movementTone(m4.movement)}>${t5(`ui.movement.${m4.movement}`)}</ok-status-pill>
          ${m4.service_name ?? t5("ui.movementNoService")}
        </h3>
        <p>${this.stamp(m4.redeemed_at)} · ${t5("ui.movementCustomer")}: ${this.customerLabel(m4.customer_id)}${m4.sale_id ? b2` · ${t5("ui.movementSale")}: ${m4.sale_id}` : A}</p>
        ${refunded ? b2`<p class="refund">
              ${t5("ui.movementRefundedBy", { who: this.userLabel(m4.refunded_by), when: this.stamp(m4.refunded_at) })}
              · ${t5("ui.movementRefundDoc")}: ${m4.refund_ref ?? "\u2014"}
              ${m4.refund_note ? b2` · ${m4.refund_note}` : A}
            </p>
            ${Number(m4.refund_expired) ? b2`<ok-inline-feedback data-testid=${`services-packages-movement-refund-expired-${m4.redemption_id}`} tone="warning" icon="alert-circle-outline">${t5("ui.movementRefundedExpired")}</ok-inline-feedback>` : A}` : A}
      </ion-label>
    </ion-item>`;
  }
  renderMovements() {
    const t5 = (k2, p4) => erplora3().t(CATALOG3, k2, p4);
    return b2`<ion-modal .isOpen=${!!this.movementsOf} @ionModalDidDismiss=${() => this.movementsOf = null}>
      <ion-header class="ion-no-border">
        <ion-toolbar>
          <ion-title>${t5("ui.movementsTitle")}</ion-title>
          <ion-buttons slot="end">
            <ion-button data-testid="services-packages-movements-close" @click=${() => this.movementsOf = null}>${t5("ui.btnClose")}</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <!-- Self-styled: ion-modal is reparented to <body>, this component's CSS does not reach it. -->
        <p><b>${this.movementsOf?.name ?? ""}</b> — ${t5("ui.movementsHint")}</p>
        <!-- The error goes ABOVE the list, not instead of it: a page that failed to load must not
             take away the movements already on screen. -->
        ${this.movementsError ? b2`<ok-inline-feedback data-testid="services-packages-movements-error" tone="danger" icon="alert-circle-outline">${this.movementsError}</ok-inline-feedback>` : A}
        ${this.movements.length === 0 ? this.movementsLoading ? b2`<ok-inline-feedback data-testid="services-packages-movements-loading" tone="neutral" icon="time-outline">${t5("ui.loading")}</ok-inline-feedback>` : this.movementsError ? A : b2`<ok-inline-feedback data-testid="services-packages-movements-empty" tone="neutral" icon="information-circle-outline">${t5("ui.emptyMovements")}</ok-inline-feedback>` : b2`<ion-list lines="full">${this.movements.map((m4) => this.renderMovement(m4))}</ion-list>
              ${this.movements.length < this.movementsTotal ? b2`<p class="more">${t5("ui.movementsCount", { shown: this.movements.length, total: this.movementsTotal })}</p>
                    <ion-button expand="block" fill="clear" data-testid="services-packages-movements-more" ?disabled=${this.movementsLoading} @click=${() => this.loadMoreMovements()}>
                      ${this.movementsLoading ? t5("ui.loading") : t5("ui.movementsMore")}
                    </ion-button>` : A}`}
      </ion-content>
    </ion-modal>`;
  }
  renderOrphan(o7) {
    const t5 = (k2, p4) => erplora3().t(CATALOG3, k2, p4);
    const worthless = !Number(o7.has_value);
    return b2`<ion-item class="movement">
      <ion-label class="ion-text-wrap">
        <h3>
          <ok-status-pill size="sm" tone=${worthless ? "neutral" : "warning"}>
            ${worthless ? t5("ui.orphanNoValue") : t5("ui.orphanRemaining", { remaining: o7.remaining ?? 0 })}
          </ok-status-pill>
          ${o7.package_name}
        </h3>
        <p>
          ${erplora3().formatMoney(Number(o7.amount_cents) || 0)}
          · ${t5("ui.orphanDeletedAt", { when: this.stamp(o7.customer_deleted_at) })}
          ${Number(o7.is_expired) ? b2` · ${t5("ui.orphanExpired")}` : A}
        </p>
        <!-- The opaque id, which is all there is: no name, no e-mail, no phone. It is the only
             handle that matches this voucher against the sale that paid for it. -->
        <p>${t5("ui.orphanCustomerRef")}: ${o7.customer_id}</p>
      </ion-label>
    </ion-item>`;
  }
  renderOrphans() {
    const t5 = (k2, p4) => erplora3().t(CATALOG3, k2, p4);
    return b2`<ion-modal .isOpen=${this.orphansOpen} @ionModalDidDismiss=${() => this.orphansOpen = false}>
      <ion-header class="ion-no-border">
        <ion-toolbar>
          <ion-title>${t5("ui.orphansTitle")}</ion-title>
          <ion-buttons slot="end">
            <ion-button data-testid="services-packages-orphans-close" @click=${() => this.orphansOpen = false}>${t5("ui.btnClose")}</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <!-- Self-styled: ion-modal is reparented to <body>, this component's CSS does not reach it. -->
        <p>${t5("ui.orphansHint")}</p>
        <!-- The error goes ABOVE the list, not instead of it: a page that failed must not take away
             the rows already on screen. -->
        ${this.orphansError ? b2`<ok-inline-feedback data-testid="services-packages-orphans-error" tone="danger" icon="alert-circle-outline">${this.orphansError}</ok-inline-feedback>` : A}
        ${this.orphans.length === 0 ? this.orphansLoading ? b2`<ok-inline-feedback data-testid="services-packages-orphans-loading" tone="neutral" icon="time-outline">${t5("ui.loading")}</ok-inline-feedback>` : this.orphansError ? A : b2`<ok-inline-feedback data-testid="services-packages-orphans-empty" tone="neutral" icon="information-circle-outline">${t5("ui.emptyOrphans")}</ok-inline-feedback>` : b2`<ion-list lines="full">${this.orphans.map((o7) => this.renderOrphan(o7))}</ion-list>
              ${this.orphans.length < this.orphansTotal ? b2`<p class="more">${t5("ui.orphansCount", { shown: this.orphans.length, total: this.orphansTotal })}</p>
                    <ion-button expand="block" fill="clear" data-testid="services-packages-orphans-more" ?disabled=${this.orphansLoading} @click=${() => this.loadMoreOrphans()}>
                      ${this.orphansLoading ? t5("ui.loading") : t5("ui.orphansMore")}
                    </ion-button>` : A}`}
      </ion-content>
    </ion-modal>`;
  }
  renderGrant(g3) {
    const t5 = (k2, p4) => erplora3().t(CATALOG3, k2, p4);
    const voided = g3.status === "voided";
    const voidable = Number(g3.can_void) === 1 && can3("services.void_grant");
    const adjustable = Number(g3.can_adjust) === 1 && can3("services.adjust_grant");
    const giftedUses = Number(g3.adjusted_uses) || 0;
    const giftedDays = Number(g3.adjusted_days) || 0;
    return b2`<ion-item class="movement">
      <ion-label class="ion-text-wrap">
        <h3>
          <ok-status-pill size="sm" tone=${voided ? "neutral" : "success"}>${t5(`ui.grantStatus.${g3.status}`)}</ok-status-pill>
          ${t5("ui.movementCustomer")}: ${this.customerLabel(g3.customer_id)}
        </h3>
        <p>
          ${this.stamp(g3.granted_at)} · ${erplora3().formatMoney(Number(g3.amount_cents) || 0)}
          · ${g3.max_uses == null ? t5("ui.grantUsesUnlimited", { used: Number(g3.used) || 0 }) : t5("ui.grantUses", { used: Number(g3.used) || 0, remaining: Number(g3.remaining) || 0 })}
          ${g3.sale_id ? b2` · ${t5("ui.movementSale")}: ${g3.sale_id}` : A}
        </p>
        <p>
          ${g3.expires_at ? t5("ui.grantExpires", { when: this.day(g3.expires_at) }) : t5("ui.grantNoExpiry")}
          ${giftedUses < 0 ? b2` · ${t5("ui.grantCorrected", { uses: -giftedUses, days: giftedDays })}` : giftedUses || giftedDays ? b2` · ${t5("ui.grantAdjusted", { uses: giftedUses, days: giftedDays })}` : A}
        </p>
        ${voided ? b2`<p class="refund">${t5("ui.grantVoidedBy", { who: this.userLabel(g3.voided_by), when: this.stamp(g3.voided_at) })}${g3.void_reason ? b2` · ${g3.void_reason}` : A}</p>` : A}
      </ion-label>
      ${adjustable ? b2`<ion-button slot="end" size="small" fill="clear" data-testid=${`services-packages-grant-adjust-${g3.grant_id}`} @click=${() => this.askAdjust(g3)}>${t5("ui.actionAdjustGrant")}</ion-button>` : A}
      ${voidable ? b2`<ion-button slot="end" size="small" fill="clear" data-testid=${`services-packages-grant-void-${g3.grant_id}`} style=${ionTone2("text", "danger")} @click=${() => this.askVoid(g3)}>${t5("ui.actionVoidGrant")}</ion-button>` : A}
    </ion-item>`;
  }
  /** The adjust form (services#118): only the halves the voucher can take, a mandatory reason, and
   *  a preview of what the customer will have — the server re-computes it, this is for the eye.
   *  On a voucher with a session limit the sessions ADD or REMOVE (services#119, a correction). */
  renderAdjustForm(g3) {
    const t5 = (k2, p4) => erplora3().t(CATALOG3, k2, p4);
    const amounts = this.adjustAmounts();
    const hasLimit = g3.max_uses != null;
    const expires = g3.expires_at != null;
    const newRemaining = hasLimit ? (Number(g3.remaining) || 0) + (amounts?.uses ?? 0) : null;
    let newExpiry = null;
    if (expires) {
      const d3 = new Date(String(g3.expires_at));
      if (!Number.isNaN(d3.getTime())) {
        d3.setUTCDate(d3.getUTCDate() + (amounts?.days ?? 0));
        newExpiry = d3.toISOString();
      }
    }
    const removing = this.adjustDirection === "remove";
    return b2`<p>${t5("ui.adjustGrantHint", { customer: this.customerLabel(g3.customer_id) })}</p>
      ${hasLimit ? b2`<ion-segment data-testid="services-packages-grant-adjust-direction" class="ion-margin-top" .value=${this.adjustDirection} ?disabled=${this.adjusting} @ionChange=${(e6) => this.adjustDirection = e6.detail?.value === "remove" ? "remove" : "add"}>
              <ion-segment-button data-testid="services-packages-grant-adjust-direction-add" value="add"><ion-label>${t5("ui.adjustAddSessions")}</ion-label></ion-segment-button>
              <ion-segment-button data-testid="services-packages-grant-adjust-direction-remove" value="remove"><ion-label>${t5("ui.adjustRemoveSessions")}</ion-label></ion-segment-button>
            </ion-segment>
            <ion-input data-testid="services-packages-grant-adjust-uses" class="ion-margin-top" fill="outline" mode="md" label-placement="floating" label=${t5(removing ? "ui.adjustRemoveUsesLabel" : "ui.adjustUsesLabel")} helper-text=${t5(removing ? "ui.adjustRemoveUsesHelp" : "ui.adjustUsesHelp", { remaining: Number(g3.remaining) || 0 })} type="number" inputmode="numeric" min="0" max=${removing ? this.removableUses(g3) : 100} step="1" .value=${this.adjustUses} @ionInput=${(e6) => this.adjustUses = String(e6.target.value ?? "")}></ion-input>` : A}
      ${expires ? b2`<ion-input data-testid="services-packages-grant-adjust-days" class="ion-margin-top" fill="outline" mode="md" label-placement="floating" label=${t5("ui.adjustDaysLabel")} helper-text=${t5("ui.adjustDaysHelp", { when: this.day(g3.expires_at) })} type="number" inputmode="numeric" min="0" max="366" step="1" .value=${this.adjustDays} @ionInput=${(e6) => this.adjustDays = String(e6.target.value ?? "")}></ion-input>` : A}
      <ion-textarea data-testid="services-packages-grant-adjust-reason" class="ion-margin-top" fill="outline" mode="md" label-placement="floating" label=${t5("ui.voidReasonLabel")} helper-text=${t5("ui.adjustReasonHelp")} auto-grow maxlength="500" .value=${this.adjustReason} @ionInput=${(e6) => this.adjustReason = String(e6.target.value ?? "")}></ion-textarea>
      <ok-inline-feedback data-testid="services-packages-grant-adjust-preview" tone="info" icon=${removing ? "remove-circle-outline" : "gift-outline"}>
        ${t5("ui.adjustPreview", {
      remaining: newRemaining == null ? t5("ui.adjustPreviewUnlimited") : newRemaining,
      when: newExpiry ? this.day(newExpiry) : t5("ui.grantNoExpiry")
    })}
      </ok-inline-feedback>
      ${this.adjustError ? b2`<ok-inline-feedback data-testid="services-packages-grant-adjust-error" tone="danger" icon="alert-circle-outline">${this.adjustError}</ok-inline-feedback>` : A}
      <ion-button class="ion-margin-top" expand="block" data-testid="services-packages-grant-adjust-submit" ?disabled=${this.adjusting || !amounts || !this.adjustReason.trim()} @click=${() => this.confirmAdjust()}>
        ${this.adjusting ? t5("ui.btnSaving") : t5("ui.actionAdjustGrant")}
      </ion-button>
      <ion-button expand="block" fill="outline" data-testid="services-packages-grant-adjust-cancel" ?disabled=${this.adjusting} @click=${() => this.cancelAdjust()}>${t5("ui.btnCancel")}</ion-button>`;
  }
  renderVoidConfirm(g3) {
    const t5 = (k2, p4) => erplora3().t(CATALOG3, k2, p4);
    return b2`<p>${t5("ui.voidGrantHint", { customer: this.customerLabel(g3.customer_id), amount: erplora3().formatMoney(Number(g3.amount_cents) || 0) })}</p>
      <ion-textarea data-testid="services-packages-grant-void-reason" fill="outline" mode="md" label-placement="floating" label=${t5("ui.voidReasonLabel")} helper-text=${t5("ui.voidReasonHelp")} auto-grow maxlength="500" .value=${this.voidReason} @ionInput=${(e6) => this.voidReason = String(e6.target.value ?? "")}></ion-textarea>
      ${this.voidError ? b2`<ok-inline-feedback data-testid="services-packages-grant-void-error" tone="danger" icon="alert-circle-outline">${this.voidError}</ok-inline-feedback>` : A}
      <ion-button class="ion-margin-top" expand="block" data-testid="services-packages-grant-void-submit" style=${ionTone2("solid", "danger")} ?disabled=${this.voiding || !this.voidReason.trim()} @click=${() => this.confirmVoid()}>
        ${this.voiding ? t5("ui.btnVoiding") : t5("ui.actionVoidGrant")}
      </ion-button>
      <ion-button expand="block" fill="outline" data-testid="services-packages-grant-void-cancel" ?disabled=${this.voiding} @click=${() => this.cancelVoid()}>${t5("ui.btnCancel")}</ion-button>`;
  }
  renderGrants() {
    const t5 = (k2, p4) => erplora3().t(CATALOG3, k2, p4);
    const confirming = this.voidTarget;
    const adjusting = this.adjustTarget;
    return b2`<ion-modal .isOpen=${!!this.grantsOf} @ionModalDidDismiss=${() => this.closeGrants()}>
      <ion-header class="ion-no-border">
        <ion-toolbar>
          <ion-title>${confirming ? t5("ui.voidGrantTitle") : adjusting ? t5("ui.adjustGrantTitle") : t5("ui.grantsTitle")}</ion-title>
          <ion-buttons slot="end">
            <ion-button data-testid="services-packages-grants-close" @click=${() => this.closeGrants()}>${t5("ui.btnClose")}</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <!-- Self-styled: ion-modal is reparented to <body>, this component's CSS does not reach it. -->
        ${confirming ? this.renderVoidConfirm(confirming) : adjusting ? this.renderAdjustForm(adjusting) : b2`<p><b>${this.grantsOf?.name ?? ""}</b> — ${t5("ui.grantsHint")}</p>
            ${this.grantsError ? b2`<ok-inline-feedback data-testid="services-packages-grants-error" tone="danger" icon="alert-circle-outline">${this.grantsError}</ok-inline-feedback>` : A}
            ${this.grants.length === 0 ? this.grantsLoading ? b2`<ok-inline-feedback data-testid="services-packages-grants-loading" tone="neutral" icon="time-outline">${t5("ui.loading")}</ok-inline-feedback>` : this.grantsError ? A : b2`<ok-inline-feedback data-testid="services-packages-grants-empty" tone="neutral" icon="information-circle-outline">${t5("ui.emptyGrants")}</ok-inline-feedback>` : b2`<ion-list lines="full">${this.grants.map((g3) => this.renderGrant(g3))}</ion-list>
                  ${this.grants.length < this.grantsTotal ? b2`<p class="more">${t5("ui.grantsCount", { shown: this.grants.length, total: this.grantsTotal })}</p>
                        <ion-button expand="block" fill="clear" data-testid="services-packages-grants-more" ?disabled=${this.grantsLoading} @click=${() => this.loadMoreGrants()}>
                          ${this.grantsLoading ? t5("ui.loading") : t5("ui.grantsMore")}
                        </ion-button>` : A}`}`}
      </ion-content>
    </ion-modal>`;
  }
  renderLines() {
    const t5 = (k2) => erplora3().t(CATALOG3, k2);
    return b2`<p class="lines-title">${t5("ui.packageLinesTitle")}</p>
      ${this.items.map((line, i7) => b2`<div class="line">
        <ion-select data-testid=${`services-packages-line-service-${i7}`} fill="outline" label-placement="floating" label=${t5("ui.colService")} .value=${line.serviceId} @ionChange=${(e6) => this.setItem(i7, { serviceId: e6.target.value })}>
          ${this.services.map((s5) => b2`<ion-select-option .value=${s5.id}>${s5.name} · ${erplora3().formatMoney(Number(s5.price) || 0)}</ion-select-option>`)}
        </ion-select>
        <ion-input data-testid=${`services-packages-line-sessions-${i7}`} fill="outline" label-placement="floating" label=${t5("ui.colSessions")} type="number" min="1" step="1" .value=${line.sessions} @ionInput=${(e6) => this.setItem(i7, { sessions: e6.target.value })}></ion-input>
        <ion-button data-testid=${`services-packages-line-remove-${i7}`} fill="clear" size="small" aria-label=${t5("ui.removeLine")} @click=${() => this.removeItem(i7)}><ion-icon slot="icon-only" name="close-outline"></ion-icon></ion-button>
      </div>`)}
      <ion-button data-testid="services-packages-add-line" fill="outline" size="small" @click=${() => this.addItem()}>${t5("ui.addLine")}</ion-button>`;
  }
  /** pm#478: the refusal appears ABOVE the button that was pressed, at the foot of the form — on a
   *  phone that can leave it off the sheet. Bring it into view once it has painted itself: scrolled
   *  before, the banner still measures 0 px and ends up under the tab bar. */
  updated(changed) {
    super.updated(changed);
    if (changed.has("formError") && this.formError) void this.revealFormError();
  }
  async revealFormError() {
    const banner = this.renderRoot.querySelector('[data-testid="services-packages-form-error"]');
    await banner?.updateComplete;
    banner?.scrollIntoView?.({ block: "center" });
  }
  render() {
    const t5 = (k2) => erplora3().t(CATALOG3, k2);
    const fixed = this.form.discountType === "fixed";
    return b2`<div class="page">
      ${this.pageError ? b2`<ok-inline-feedback data-testid="services-packages-page-error" tone="danger" icon="alert-circle-outline">${this.pageError}</ok-inline-feedback>` : A}
      ${this.ctrl?.error && !dataTableShowsLoadError() ? b2`<ok-inline-feedback data-testid="services-packages-load-error" tone="danger" icon="alert-circle-outline">${this.ctrl.error}</ok-inline-feedback>` : A}
      ${can3("services.view_orphan_grant") ? b2`<ion-button class="orphans-entry" data-testid="services-packages-open-orphans" size="small" fill="clear" @click=${() => this.openOrphans()}>
            <ion-icon slot="start" name="person-remove-outline"></ion-icon>${t5("ui.openOrphans")}
          </ion-button>` : A}
      <ok-data-table testid="services-packages-table" .error=${this.ctrl?.error ?? ""} @retry=${() => Promise.all([this.ctrl?.load(), this.loadServices()])} .serverSide=${true} .fill=${true} .views=${true} .addable=${can3("services.add_package")} .cardTitle=${(row) => String(row.name ?? "")} .columns=${this.columns} .rows=${this.ctrl?.rows ?? []} .total=${this.ctrl?.total ?? 0} .page=${this.ctrl?.state.page ?? 0} .pageSize=${this.ctrl?.state.pageSize ?? 50} .sort=${this.ctrl?.state.sort} .sortDir=${this.ctrl?.state.dir ?? "asc"} .searchable=${true} .searchPlaceholder=${t5("ui.searchPackagePlaceholder")} .actions=${this.actions} .rowClickable=${true} .emptyMessage=${this.ctrl?.loading ? t5("ui.loading") : t5("ui.emptyPackages")} @rowAction=${(e6) => this.onRowAction(e6)} @rowClick=${(e6) => this.onRowAction({ detail: { actionId: "edit", row: e6.detail.row } })}
 @pageChange=${(e6) => this.ctrl.setPage(e6.detail)} @pageSizeChange=${(e6) => this.ctrl.setPageSize(e6.detail)} @sortChange=${(e6) => this.ctrl.setSort(e6.detail.sort, e6.detail.dir)} @searchChange=${(e6) => this.ctrl.setSearch(e6.detail)} @filterChange=${(e6) => this.ctrl.setFilter(e6.detail.col, e6.detail.value)}>
        <form slot="create" class="form" data-testid="services-packages-form" @submit=${(e6) => this.save(e6)}>
          ${this.editingId && !this.editTitleInHeader ? b2`<ok-inline-feedback data-testid="services-packages-editing" tone="info" icon="create-outline">
                <b>${t5("ui.editingPackageTitle")}</b> — ${this.form.name}
                <ion-button size="small" fill="clear" data-testid="services-packages-edit-cancel" @click=${() => this.cancelEdit()}>${t5("ui.editingCancel")}</ion-button>
              </ok-inline-feedback>` : A}
          <ion-input data-testid="services-packages-name" fill="outline" label-placement="floating" label=${t5("ui.colName")} .value=${this.form.name} @ionInput=${(e6) => this.form = { ...this.form, name: e6.target.value }}></ion-input>
          <ion-select data-testid="services-packages-discount-type" fill="outline" label-placement="floating" label=${t5("ui.colDiscountType")} .value=${this.form.discountType} @ionChange=${(e6) => this.form = { ...this.form, discountType: e6.target.value }}>
            <ion-select-option value="percentage">${t5("ui.discountType.percentage")}</ion-select-option>
            <ion-select-option value="fixed">${t5("ui.discountType.fixed")}</ion-select-option>
          </ion-select>
          <ion-input data-testid="services-packages-discount-value" fill="outline" label-placement="floating" label=${fixed ? t5("ui.colDiscountAmount") : t5("ui.colDiscountPercent")} type="text" inputmode="decimal" .value=${this.form.discountValue} @ionInput=${(e6) => this.form = { ...this.form, discountValue: e6.target.value }} @ionBlur=${() => fixed && (this.form = { ...this.form, discountValue: this.normaliseMoney(this.form.discountValue) })}></ion-input>
          <ion-input data-testid="services-packages-fixed-price" fill="outline" label-placement="floating" label=${t5("ui.colFixedPrice")} helper-text=${t5("ui.fixedPriceHelp")} type="text" inputmode="decimal" .value=${this.form.fixedPrice} @ionInput=${(e6) => this.form = { ...this.form, fixedPrice: e6.target.value }} @ionBlur=${() => this.form = { ...this.form, fixedPrice: this.normaliseMoney(this.form.fixedPrice) }}></ion-input>
          <ion-input data-testid="services-packages-validity-days" fill="outline" label-placement="floating" label=${t5("ui.colValidityDays")} helper-text=${t5("ui.validityHelp")} type="number" min="1" step="1" .value=${this.form.validityDays} @ionInput=${(e6) => this.form = { ...this.form, validityDays: e6.target.value }}></ion-input>
          <ion-input data-testid="services-packages-max-uses" fill="outline" label-placement="floating" label=${t5("ui.colMaxUses")} helper-text=${t5("ui.maxUsesHelp")} type="number" min="1" step="1" .value=${this.form.maxUses} @ionInput=${(e6) => this.form = { ...this.form, maxUses: e6.target.value }}></ion-input>
          ${this.editingId ? b2`<ok-inline-feedback data-testid="services-packages-lines-fixed" tone="neutral" icon="information-circle-outline">${t5("ui.packageLinesFixed")}</ok-inline-feedback>` : this.renderLines()}
          <!-- pm#478: the refusal travels WITH the form — on a phone the panel is a full-screen
               sheet and a banner on the page underneath it is never seen. -->
          ${this.formError ? b2`<ok-inline-feedback data-testid="services-packages-form-error" tone="danger" icon="alert-circle-outline">${this.formError}</ok-inline-feedback>` : A}
          <ion-button type="submit" data-testid="services-packages-submit" ?disabled=${this.saving || !this.form.name}>${this.saving ? t5("ui.btnSaving") : this.editingId ? t5("ui.btnSave") : t5("ui.btnAdd")}</ion-button>
        </form>
      </ok-data-table>
      ${this.renderDeleteConfirm()}
      ${this.renderMovements()}
      ${this.renderOrphans()}
      ${this.renderGrants()}
    </div>`;
  }
};
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "form", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "items", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "services", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "saving", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "formError", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "pageError", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "editingId", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "editTitleInHeader", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "deleteTarget", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "movementsOf", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "movements", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "movementsTotal", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "movementsLoading", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "movementsError", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "orphansOpen", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "orphans", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "orphansTotal", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "orphansLoading", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "orphansError", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "customerNames", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "userNames", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "grantsOf", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "grants", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "grantsTotal", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "grantsLoading", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "grantsError", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "voidTarget", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "voidReason", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "voiding", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "voidError", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "adjustTarget", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "adjustUses", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "adjustDays", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "adjustReason", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "adjustDirection", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "adjusting", 2);
__decorateClass([
  r5()
], ErpServicesPackages.prototype, "adjustError", 2);
define("erp-services-packages", ErpServicesPackages);

// @erplora/module-services/ui/components/erp-services-session-refund/erp-services-session-refund.ts
var CATALOG4 = { es: es_default, en: en_default };
var REASONS = ["already_refunded", "not_settled"];
function checkedOf(e6) {
  const detail = e6.detail;
  if (detail && typeof detail.checked === "boolean") return detail.checked;
  return !!e6.target?.checked;
}
function erplora4() {
  const c5 = globalThis.erplora;
  if (!c5) throw new Error("erplora SDK no inicializado por el shell");
  return c5;
}
var ErpServicesSessionRefund = class extends i3 {
  constructor() {
    super(...arguments);
    this.saleId = "";
    this.lineRef = "";
    this.serviceId = "";
    this.lineIndex = 0;
    this.refundId = "";
    this.refundRef = "";
    this.session = null;
    this.armed = false;
    this.loading = true;
    this.loadFailed = false;
    this.feedback = "";
    this.busy = false;
    this.refunded = false;
    /** One attempt per commit. The host dispatches once, but a screen is not a contract. */
    this.committed = false;
    /** The (sale, service, ordinal) the current answer belongs to — the guard against re-reading. */
    this.loadedKey = "";
    /**
     * The host's document exists: give the session back, and make the screen WAIT for it.
     *
     * 🔴 `waitFor` is not optional politeness. Without it the screen closes as soon as the money is
     * back and unmounts this element mid-command, leaving the session spent with nobody at the
     * counter able to give it back — the exact failure this whole issue is about.
     */
    this.onCommit = (e6) => {
      const detail = e6.detail ?? {};
      const ref = String(detail.refundRef || this.refundRef || detail.refundId || this.refundId || "");
      if (this.committed || !this.armed || !this.session || !ref) return;
      this.committed = true;
      const promise = this.giveBack(ref);
      if (typeof detail.waitFor === "function") detail.waitFor(promise);
      else void promise.catch(() => void 0);
    };
  }
  static {
    this.styles = i`
    :host { display: block; font-family: system-ui, sans-serif; color: var(--ion-text-color, #1c1b18); }
    .box { display: flex; flex-direction: column; gap: 0.45rem; }
    .head { display: flex; align-items: baseline; gap: 0.5rem; flex-wrap: wrap; }
    /* A voucher name can be a single long code: break it rather than push the card wider. */
    .name { font-weight: 600; overflow-wrap: anywhere; }
    .counter { font-variant-numeric: tabular-nums; font-size: 0.85rem;
               color: var(--ion-color-medium, #6b6b6b); }
    .choice { display: grid; grid-template-columns: auto 1fr; gap: 0.5rem; align-items: center;
              padding: 0.5rem 0.6rem; border: 1px solid var(--ion-color-step-200, #e2e0dc);
              border-radius: 0.6rem; cursor: pointer; }
    .choice[aria-checked='true'] { border-color: var(--ion-color-primary, #3b7d4f);
                                   background: var(--ion-color-step-50, #f7f6f3); }
    /* Ionic paints the checkbox label nowrap: on a phone the sentence ran off the card (services#137). */
    ion-checkbox::part(label) { white-space: normal; overflow-wrap: anywhere; }
    .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  `;
  }
  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("erp:tender-refund-commit", this.onCommit);
    void this.load();
  }
  disconnectedCallback() {
    this.removeEventListener("erp:tender-refund-commit", this.onCommit);
    super.disconnectedCallback();
  }
  updated(changed) {
    if (changed.has("saleId") || changed.has("serviceId") || changed.has("lineIndex")) {
      void this.load();
    }
  }
  t(key, params) {
    return erplora4().t(CATALOG4, key, params);
  }
  key() {
    return `${this.saleId}|${this.serviceId}|${this.lineIndex}`;
  }
  async load(force = false) {
    if (!this.saleId || !this.serviceId) {
      this.session = null;
      this.loading = false;
      return;
    }
    const key = this.key();
    if (!force && key === this.loadedKey) return;
    this.loadedKey = key;
    this.loading = true;
    this.loadFailed = false;
    this.feedback = "";
    try {
      const rows = await erplora4().query(
        "services.packages.redemptions_for_sale",
        { sale_id: this.saleId }
      );
      const mine = (Array.isArray(rows) ? rows : []).filter((r6) => r6.service_id === this.serviceId);
      this.session = mine[this.lineIndex] ?? null;
      this.settleArming();
    } catch (e6) {
      this.session = null;
      this.loadFailed = true;
      this.feedback = domainMessage(e6, erplora4().locale, this.t("ui.sessionRefund.loadFailed"));
      if (this.armed) this.setArmed(false, true);
    } finally {
      this.loading = false;
    }
  }
  /** Arms by default when the session goes back — the operator un-ticks, never has to opt in. */
  settleArming() {
    const s5 = this.session;
    if (!s5) {
      this.armed = false;
      return;
    }
    this.setArmed(Number(s5.refundable) === 1);
  }
  /** `unknown` retracts an earlier `armed` without claiming the line does not go back. */
  setArmed(on, unknown = false) {
    this.armed = on;
    const warning = on ? this.expiryWarning() : "";
    const detail = { lineRef: this.lineRef };
    if (warning) detail.warning = warning;
    if (unknown && !on) detail.unknown = true;
    this.dispatchEvent(
      new CustomEvent(on ? "erp:tender-refund-armed" : "erp:tender-refund-disarmed", {
        bubbles: true,
        composed: true,
        detail
      })
    );
  }
  /** The sentence the host paints next to **Devolver**, or '' when the voucher is live. */
  expiryWarning() {
    const s5 = this.session;
    if (!s5 || Number(s5.voucher_expired) !== 1) return "";
    return this.t("ui.sessionRefund.expired", {
      name: s5.package_name,
      date: s5.expires_at ? new Date(s5.expires_at).toLocaleDateString(erplora4().locale) : ""
    });
  }
  /** The operator's choice. It changes what this hole promises; it never changes the money. */
  toggle(on) {
    if (!this.session || Number(this.session.refundable) !== 1) return;
    if (on === this.armed) return;
    this.feedback = "";
    this.setArmed(on);
  }
  async giveBack(refundRef) {
    const session = this.session;
    if (!session) return;
    this.busy = true;
    this.feedback = "";
    try {
      await erplora4().command("services.packages.refund_redemption", {
        redemption_id: session.redemption_id,
        refund_ref: refundRef
      });
      this.refunded = true;
    } catch (e6) {
      this.feedback = domainMessage(e6, erplora4().locale, this.t("ui.sessionRefund.refundFailed"));
      throw e6;
    } finally {
      this.busy = false;
    }
  }
  renderCounter(s5) {
    if (Number(s5.is_unlimited) === 1 || s5.remaining_after === null) {
      return b2`<span class="counter">${this.t("ui.sessionRefund.unlimited")}</span>`;
    }
    return b2`<span class="counter"
      >${this.t("ui.sessionRefund.remainingAfter", {
      before: s5.remaining_before,
      after: s5.remaining_after
    })}</span
    >`;
  }
  renderReason(s5) {
    const known = REASONS.includes(s5.reason);
    return b2`<ok-inline-feedback
      data-testid="services-session-refund-reason"
      tone="neutral"
      icon="information-circle-outline"
      >${known ? this.t(`ui.sessionRefund.reason.${s5.reason}`) : this.t("ui.sessionRefund.reason.generic")}</ok-inline-feedback
    >`;
  }
  renderFeedback() {
    if (!this.feedback) return A;
    return b2`<ok-inline-feedback
      data-testid="services-session-refund-error"
      tone="danger"
      icon="alert-circle-outline"
      >${this.feedback}</ok-inline-feedback
    >`;
  }
  render() {
    if (this.loading) {
      return b2`<div class="box">
        <ion-skeleton-text animated style="height: 2.75rem"></ion-skeleton-text>
      </div>`;
    }
    if (this.loadFailed) {
      return b2`<div class="box">
        <ok-inline-feedback
          data-testid="services-session-refund-load-error"
          tone="danger"
          icon="alert-circle-outline"
          >${this.t("ui.sessionRefund.loadFailed")}</ok-inline-feedback
        >
        <div class="actions">
          <ion-button fill="clear" data-testid="services-session-refund-retry" @click=${() => this.load(true)}
            >${this.t("ui.sessionRefund.btnRetry")}</ion-button
          >
        </div>
      </div>`;
    }
    const s5 = this.session;
    if (!s5) return A;
    if (this.refunded) {
      return b2`<div class="box">
        <ok-inline-feedback
          data-testid="services-session-refund-done"
          tone="success"
          icon="checkmark-circle-outline"
          >${this.t("ui.sessionRefund.done", { name: s5.package_name })}</ok-inline-feedback
        >
      </div>`;
    }
    if (Number(s5.refundable) !== 1) {
      return b2`<div class="box">
        <div class="head"><span class="name">${s5.package_name}</span></div>
        ${this.renderReason(s5)}${this.renderFeedback()}
      </div>`;
    }
    const warning = this.expiryWarning();
    return b2`<div class="box">
      <div class="choice" aria-checked=${this.armed ? "true" : "false"}>
        <!-- 🔴 ONE handler, and it is \`ionChange\`. Wiring \`@click\` as well looks harmless — and
             is, in happy-dom, where \`ion-checkbox\` is an unknown element and only the click ever
             fires — but a real Ionic checkbox emits BOTH: the change would set the state and the
             click would immediately flip it back, so the tick would do nothing on a real till and
             every test would still be green. The label goes INSIDE the control, which is Ionic's
             own pattern and gives the whole row as a tap target. -->
        <ion-checkbox
          data-testid="services-session-refund-give-back"
          label-placement="end"
          justify="start"
          ?checked=${this.armed}
          ?disabled=${this.busy}
          @ionChange=${(e6) => this.toggle(checkedOf(e6))}
        >
          <div>
            <div class="head">
              <span class="name"
                >${this.t("ui.sessionRefund.giveBack", { name: s5.package_name })}</span
              >
            </div>
            ${this.renderCounter(s5)}
          </div>
        </ion-checkbox>
      </div>
      ${warning ? b2`<ok-inline-feedback
            data-testid="services-session-refund-expiry-warning"
            tone="warning"
            icon="alert-circle-outline"
            >${warning}</ok-inline-feedback
          >` : A}
      ${this.renderFeedback()}
    </div>`;
  }
};
__decorateClass([
  n4({ type: String, attribute: "sale-id" })
], ErpServicesSessionRefund.prototype, "saleId", 2);
__decorateClass([
  n4({ type: String, attribute: "line-ref" })
], ErpServicesSessionRefund.prototype, "lineRef", 2);
__decorateClass([
  n4({ type: String, attribute: "service-id" })
], ErpServicesSessionRefund.prototype, "serviceId", 2);
__decorateClass([
  n4({ type: Number, attribute: "line-index" })
], ErpServicesSessionRefund.prototype, "lineIndex", 2);
__decorateClass([
  n4({ type: String, attribute: "refund-id" })
], ErpServicesSessionRefund.prototype, "refundId", 2);
__decorateClass([
  n4({ type: String, attribute: "refund-ref" })
], ErpServicesSessionRefund.prototype, "refundRef", 2);
__decorateClass([
  r5()
], ErpServicesSessionRefund.prototype, "session", 2);
__decorateClass([
  r5()
], ErpServicesSessionRefund.prototype, "armed", 2);
__decorateClass([
  r5()
], ErpServicesSessionRefund.prototype, "loading", 2);
__decorateClass([
  r5()
], ErpServicesSessionRefund.prototype, "loadFailed", 2);
__decorateClass([
  r5()
], ErpServicesSessionRefund.prototype, "feedback", 2);
__decorateClass([
  r5()
], ErpServicesSessionRefund.prototype, "busy", 2);
__decorateClass([
  r5()
], ErpServicesSessionRefund.prototype, "refunded", 2);
define("erp-services-session-refund", ErpServicesSessionRefund);

// @erplora/module-services/ui/components/erp-services-voucher-tender/erp-services-voucher-tender.ts
var CATALOG5 = { es: es_default, en: en_default };
var REASONS2 = [
  "only_option",
  "finite_before_unlimited",
  "expires_first",
  "already_started",
  "fewest_sessions_left",
  "oldest_voucher",
  "stable_order"
];
function erplora5() {
  const c5 = globalThis.erplora;
  if (!c5) throw new Error("erplora SDK no inicializado por el shell");
  return c5;
}
function can4(permission) {
  const client = erplora5();
  return typeof client.hasPermission === "function" ? client.hasPermission(permission) : true;
}
var ErpServicesVoucherTender = class extends i3 {
  constructor() {
    super(...arguments);
    this.customerId = "";
    this.serviceId = "";
    this.checkoutRef = "";
    this.lineRef = "";
    this.options = [];
    this.selectedId = "";
    this.held = null;
    this.feedback = "";
    this.loading = true;
    this.loadFailed = false;
    this.busy = false;
  }
  static {
    this.styles = i`
    :host { display: block; font-family: system-ui, sans-serif; color: var(--ion-text-color, #1c1b18); }
    .box { display: flex; flex-direction: column; gap: 0.6rem; }
    .head { display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; }
    .title { font-size: 0.95rem; font-weight: 600; margin: 0; }
    .candidates { font-size: 0.8rem; color: var(--ion-color-medium, #6b6b6b); }
    .option { display: grid; grid-template-columns: auto 1fr; gap: 0.5rem; align-items: start;
              padding: 0.55rem 0.6rem; border: 1px solid var(--ion-color-step-200, #e2e0dc);
              border-radius: 0.6rem; cursor: pointer; }
    .option[aria-checked='true'] { border-color: var(--ion-color-primary, #3b7d4f); background: var(--ion-color-step-50, #f7f6f3); }
    .name { font-weight: 600; }
    .counter { font-variant-numeric: tabular-nums; }
    .meta { font-size: 0.8rem; color: var(--ion-color-medium, #6b6b6b); display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .reason { font-size: 0.8rem; }
    .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .actions ion-button { flex: 1 1 9rem; }
    @media (min-width: 40rem) { .actions ion-button { flex: 0 0 auto; } }
  `;
  }
  connectedCallback() {
    super.connectedCallback();
    void this.load();
  }
  updated(changed) {
    if (!this.held && (changed.has("customerId") || changed.has("serviceId") || changed.has("lineRef"))) {
      void this.load();
    }
  }
  t(key, params) {
    return erplora5().t(CATALOG5, key, params);
  }
  async load() {
    if (!this.customerId || !this.serviceId) {
      this.options = [];
      this.loading = false;
      return;
    }
    this.loading = true;
    this.loadFailed = false;
    try {
      const mine = await this.recoverHold();
      if (mine) {
        this.held = mine;
        this.options = [];
        return;
      }
      const rows = await erplora5().query("services.packages.tender_options", {
        customer_id: this.customerId,
        service_id: this.serviceId
      });
      this.options = Array.isArray(rows) ? rows : [];
      const stillThere = this.options.some((o7) => o7.grant_id === this.selectedId);
      if (!stillThere) {
        this.selectedId = this.options.find((o7) => Number(o7.is_default) === 1)?.grant_id ?? this.options[0]?.grant_id ?? "";
      }
    } catch (e6) {
      this.options = [];
      this.loadFailed = true;
      this.feedback = domainMessage(e6, erplora5().locale, this.t("ui.tender.loadFailed"));
    } finally {
      this.loading = false;
    }
  }
  /**
   * The hold this checkout already has for THIS line, or `null`.
   *
   * A checkout covers several lines and each one hosts its own slot, so the read is filtered by
   * `line_ref` here rather than server-side: one query answers the whole ticket and every slot
   * picks its own row out of it, instead of N round trips that would each say the same thing.
   *
   * The read only ever returns what can still be UNDONE — live, held, unsettled, not past its
   * deadline — so a settled session (the sale was paid; giving it back is a refund, with its own
   * audited door) never arrives here to be offered an «undo» the runtime would then refuse.
   */
  async recoverHold() {
    if (!this.checkoutRef || !this.lineRef) return null;
    const rows = await erplora5().query("services.packages.holds_for_checkout", {
      checkout_ref: this.checkoutRef
    });
    const mine = (Array.isArray(rows) ? rows : []).find((r6) => r6.line_ref === this.lineRef);
    if (!mine) return null;
    return {
      redemption_id: String(mine.redemption_id ?? ""),
      package_name: String(mine.package_name ?? ""),
      // `remaining_after` is NULL exactly when the voucher was sold as unlimited — the query
      // derives both from the same `max_uses IS NULL`, so re-deriving it from `is_unlimited` here
      // would be a second opinion on a question that already has one answer, and a branch no test
      // could tell apart. The SQL is the authority; `tests/hold_recovery.postgres.test.py` §K is
      // what holds it to that.
      remaining_after: mine.remaining_after ?? null
    };
  }
  select(grantId) {
    this.selectedId = grantId;
    this.feedback = "";
  }
  /** The explicit redemption: nothing is spent until this runs. */
  async confirm() {
    const option = this.options.find((o7) => o7.grant_id === this.selectedId);
    if (!option || this.busy) return;
    this.busy = true;
    this.feedback = "";
    try {
      const out = await erplora5().command("services.packages.hold_for_line", {
        grant_id: option.grant_id,
        customer_id: this.customerId,
        service_id: this.serviceId,
        checkout_ref: this.checkoutRef,
        line_ref: this.lineRef
      });
      this.held = {
        redemption_id: String(out?.redemption_id ?? ""),
        package_name: String(out?.package_name ?? option.package_name),
        remaining_after: out?.remaining_after ?? option.remaining_after
      };
      this.dispatchEvent(
        new CustomEvent("erp:voucher-held", {
          bubbles: true,
          composed: true,
          detail: {
            redemptionId: this.held.redemption_id,
            grantId: option.grant_id,
            packageId: option.package_id,
            lineRef: this.lineRef,
            checkoutRef: this.checkoutRef
          }
        })
      );
    } catch (e6) {
      this.feedback = domainMessage(e6, erplora5().locale, this.t("ui.tender.holdFailed"));
    } finally {
      this.busy = false;
    }
  }
  /** Undo, which the runtime allows only while the sale is not paid. */
  async undo() {
    const held = this.held;
    if (!held || this.busy) return;
    this.busy = true;
    this.feedback = "";
    try {
      await erplora5().command("services.packages.release_hold", {
        redemption_id: held.redemption_id
      });
      this.held = null;
      this.dispatchEvent(
        new CustomEvent("erp:voucher-released", {
          bubbles: true,
          composed: true,
          detail: { redemptionId: held.redemption_id, lineRef: this.lineRef }
        })
      );
      await this.load();
    } catch (e6) {
      this.feedback = domainMessage(e6, erplora5().locale, this.t("ui.tender.releaseFailed"));
    } finally {
      this.busy = false;
    }
  }
  renderCounter(o7) {
    if (Number(o7.is_unlimited) === 1 || o7.remaining_after === null) {
      return b2`<span class="counter">${this.t("ui.tender.unlimited")}</span>`;
    }
    return b2`<span class="counter"
      >${this.t("ui.tender.remainingAfter", {
      before: o7.remaining_before,
      after: o7.remaining_after
    })}</span
    >`;
  }
  renderReason(o7) {
    if (Number(o7.is_default) !== 1) return A;
    const known = REASONS2.includes(o7.default_reason);
    return b2`<div class="reason">
      ${known ? this.t(`ui.tender.reason.${o7.default_reason}`) : this.t("ui.tender.reason.generic")}
    </div>`;
  }
  renderOption(o7) {
    const chosen = o7.grant_id === this.selectedId;
    return b2`<label
      class="option"
      role="radio"
      aria-checked=${chosen ? "true" : "false"}
    >
      <ion-radio
        data-testid=${`services-voucher-tender-option-${o7.grant_id}`}
        .value=${o7.grant_id}
        ?checked=${chosen}
        @click=${() => this.select(o7.grant_id)}
      ></ion-radio>
      <div>
        <div class="name">${o7.package_name}</div>
        <div class="meta">
          ${this.renderCounter(o7)}
          ${o7.expires_at ? b2`<span
                >${this.t("ui.tender.expires", {
      date: new Date(o7.expires_at).toLocaleDateString(erplora5().locale)
    })}</span
              >` : A}
        </div>
        ${this.renderReason(o7)}
      </div>
    </label>`;
  }
  renderHeld() {
    const held = this.held;
    if (!held) return A;
    return b2`<div class="box">
      <ok-inline-feedback
        data-testid="services-voucher-tender-held"
        tone="success"
        icon="checkmark-circle-outline"
      >
        ${held.remaining_after === null ? this.t("ui.tender.heldUnlimited", { name: held.package_name }) : this.t("ui.tender.held", { name: held.package_name, after: held.remaining_after })}
      </ok-inline-feedback>
      ${this.feedback ? b2`<ok-inline-feedback
            data-testid="services-voucher-tender-error"
            tone="danger"
            icon="alert-circle-outline"
            >${this.feedback}</ok-inline-feedback
          >` : A}
      <div class="actions">
        <ion-button
          data-testid="services-voucher-tender-undo"
          fill="clear"
          ?disabled=${this.busy}
          @click=${() => this.undo()}
          >${this.t("ui.tender.btnUndo")}</ion-button
        >
      </div>
    </div>`;
  }
  render() {
    if (this.held) return this.renderHeld();
    if (this.loading) {
      return b2`<div class="box"><ion-skeleton-text animated style="height: 3.5rem"></ion-skeleton-text></div>`;
    }
    if (this.loadFailed) {
      const detail = this.feedback && this.feedback !== this.t("ui.tender.loadFailed") ? this.feedback : "";
      return b2`<div class="box">
        <ok-inline-feedback
          data-testid="services-voucher-tender-load-error"
          tone="danger"
          icon="alert-circle-outline"
        >
          ${this.t("ui.tender.loadFailed")}${detail ? b2` <span class="meta">${detail}</span>` : A}
        </ok-inline-feedback>
        <div class="actions">
          <ion-button fill="clear" data-testid="services-voucher-tender-retry" @click=${() => this.load()}
            >${this.t("ui.tender.btnRetry")}</ion-button
          >
        </div>
      </div>`;
    }
    if (this.options.length === 0) {
      return b2`<div class="box">
        <ok-inline-feedback
          data-testid="services-voucher-tender-none"
          tone="neutral"
          icon="information-circle-outline"
          >${this.t("ui.tender.none")}</ok-inline-feedback
        >
      </div>`;
    }
    const candidates = Number(this.options[0]?.candidate_count ?? this.options.length);
    return b2`<div class="box">
      <div class="head">
        <h3 class="title">${this.t("ui.tender.title")}</h3>
        ${candidates > 1 ? b2`<span class="candidates"
              >${this.t("ui.tender.candidates", { count: candidates })}</span
            >` : A}
      </div>
      <div role="radiogroup" class="box">
        ${this.options.map((o7) => this.renderOption(o7))}
      </div>
      ${this.feedback ? b2`<ok-inline-feedback
            data-testid="services-voucher-tender-error"
            tone="danger"
            icon="alert-circle-outline"
            >${this.feedback}</ok-inline-feedback
          >` : A}
      ${can4("services.hold_package") ? b2`<div class="actions">
            <ion-button
              data-testid="services-voucher-tender-confirm"
              ?disabled=${this.busy || !this.selectedId}
              @click=${() => this.confirm()}
              >${this.busy ? this.t("ui.tender.btnHolding") : this.t("ui.tender.btnConfirm")}</ion-button
            >
          </div>` : A}
    </div>`;
  }
};
__decorateClass([
  n4({ type: String, attribute: "customer-id" })
], ErpServicesVoucherTender.prototype, "customerId", 2);
__decorateClass([
  n4({ type: String, attribute: "service-id" })
], ErpServicesVoucherTender.prototype, "serviceId", 2);
__decorateClass([
  n4({ type: String, attribute: "checkout-ref" })
], ErpServicesVoucherTender.prototype, "checkoutRef", 2);
__decorateClass([
  n4({ type: String, attribute: "line-ref" })
], ErpServicesVoucherTender.prototype, "lineRef", 2);
__decorateClass([
  r5()
], ErpServicesVoucherTender.prototype, "options", 2);
__decorateClass([
  r5()
], ErpServicesVoucherTender.prototype, "selectedId", 2);
__decorateClass([
  r5()
], ErpServicesVoucherTender.prototype, "held", 2);
__decorateClass([
  r5()
], ErpServicesVoucherTender.prototype, "feedback", 2);
__decorateClass([
  r5()
], ErpServicesVoucherTender.prototype, "loading", 2);
__decorateClass([
  r5()
], ErpServicesVoucherTender.prototype, "loadFailed", 2);
__decorateClass([
  r5()
], ErpServicesVoucherTender.prototype, "busy", 2);
define("erp-services-voucher-tender", ErpServicesVoucherTender);
