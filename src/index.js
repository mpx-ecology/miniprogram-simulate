/* global Event */
const path = require('path')
const jComponent = require('j-component')
const json5 = require('json5')
const RequireFromString = require('@mpxjs/mpx-jest/require-from-string')
const CustomEnvironmentJsdom = require('@mpxjs/mpx-jest/require-from-string/custom-environment-jsdom')
const _ = require('./utils')
const wxss = require('./wxss')
const compile = require('./compile')
const injectPolyfill = require('./polyfill')
const injectDefinition = require('./definition')
const JestResolver = require('jest-resolve').default ? require('jest-resolve').default : require('jest-resolve')

const environment = new CustomEnvironmentJsdom({
    testEnvironmentOptions: {
        userAgent: ''
    }
}, {
    global
})

environment.global = global
const resolver = new JestResolver(new Map(), {})
const requireFromString = new RequireFromString(resolver, {
    transform: [],
    extraGlobals: [],
    injectGlobals: true
}, environment, {})
const componentMap = {}
let mockComponentMap = {}
let nowLoad = null

/**
 * 合并两个函数
 * @param functionA 先执行
 * @param functionB 执行完 functionA 后返回
 * @returns {*}
 */
function mergeFunction(functionA, functionB) {
    if (!functionA || !functionB) return
    const merge = functionB
    functionB = (function() {
        functionA.call(this, ...arguments)
        merge.call(this, ...arguments)
    })
    return functionB
}


global.Behavior = definition => jComponent.behavior(definition)

/**
 * 自定义组件构造器
 */
global.Component = options => {
    const component = nowLoad
    const componentJsonUsingComponents = component.json.usingComponents
    const pathToIdMap = component.pathToIdMap
    // 当template 为空字符串时，强行插入'view'规避后续报错
    if (typeof component.wxml === 'string' && component.wxml.length === 0) {
        component.wxml = '<view></view>'
    }
    const definition = Object.assign({
        id: component.id,
        path: component.path,
        template: component.wxml,
        usingComponents: componentJsonUsingComponents,
        tagName: component.tagName,
    }, options)
    definition.options = Object.assign({
        classPrefix: component.tagName,
    }, definition.options || {})

    // 处理 relations
    if (definition.relations) {
        Object.keys(definition.relations).forEach(key => {
            const value = definition.relations[key]
            const componentPath = _.isAbsolute(key) ? key : path.join(path.dirname(component.path), key)
            const id = pathToIdMap[componentPath]
            if (id) {
                // 将涉及到的自定义组件路径转成 id
                value.target = id
                definition.relations[id] = value
                delete definition.relations[key]
            }
        })
    }

    if (definition.methods) {
        definition.methods.$t = (key) => key
    } else {
        definition.$t = (key) => key
    }

    if (definition.methods && definition.methods.onLoad) {
    // 可以考虑采用behaviors来实现
        const func = mergeFunction(definition.attached, definition.methods.onLoad)
        definition.attached = func
    }


    jComponent.register(definition)
}

global.Page = global.Component

/**
 * behavior 构造器
 */
global.Behavior = definition => jComponent.behavior(definition)

/**
 * 加载 behavior
 */
function behavior(definition) {
    if (typeof definition !== 'object') {
        throw new Error('definition must be a object')
    }

    return jComponent.behavior(definition)
}

/* eslint-disable complexity */
/**
 * 注册自定义组件
 */
function register(componentPath, tagName, cache, hasRegisterCache) {
    // 用于 wcc 编译器使用
    window.__webview_engine_version__ = 0.02

    if (typeof componentPath === 'object') {
    // 直接传入定义对象
        const definition = componentPath

        return jComponent.register(definition)
    }

    if (typeof componentPath !== 'string') {
        throw new Error('componentPath must be a string')
    }

    if (!tagName || typeof tagName !== 'string') {
        tagName = 'main' // 默认标签名
    }

    const id = _.getId()

    if (hasRegisterCache[componentPath]) return hasRegisterCache[componentPath]
    hasRegisterCache[componentPath] = id

    const component = {
        id,
        path: componentPath,
        tagName,
        json: _.readJson(`${componentPath}.json`),
    }

    if (!component.json) {
        throw new Error(`invalid componentPath: ${componentPath}`)
    }

    // 先加载 using components
    const rootPath = cache.options.rootPath
    const usingComponents = component.json.usingComponents || {}
    const overrideUsingComponents = cache.options.usingComponents || {}
    const usingComponentKeys = Object.keys(usingComponents)
    for (let i = 0, len = usingComponentKeys.length; i < len; i++) {
        const key = usingComponentKeys[i]

        if (Object.prototype.hasOwnProperty.call(overrideUsingComponents, key)) continue // 被 override 的跳过

        const value = usingComponents[key]
        const usingPath = _.isAbsolute(value) ? path.join(rootPath, value) : path.join(path.dirname(componentPath), value)
        const id = register(usingPath, key, cache, hasRegisterCache)

        usingComponents[key] = id
    }
    Object.assign(usingComponents, overrideUsingComponents)

    // 读取自定义组件的静态内容
    component.wxml = compile.getWxml(componentPath, cache.options)
    component.wxss = wxss.getContent(`${componentPath}.wxss`)

    // 存入需要执行的自定义组件 js
    cache.needRunJsList.push([componentPath, component])

    // 保存追加了已编译的 wxss
    cache.wxss.push(wxss.compile(component.wxss, {
        prefix: tagName,
        ...cache.options,
    }))

    return component.id
}

/**
 * 注册 MPX 组件
 * @param componentPath
 * @param tagName
 * @param cache
 * @param hasRegisterCache
 * @returns {ComponentId<WechatMiniprogram.Component.DataOption, WechatMiniprogram.Component.PropertyOption, WechatMiniprogram.Component.MethodOption>|*}
 */
function registerMpx(componentPath, tagName, cache, hasRegisterCache, componentContent) {
    // 用于 wcc 编译器使用
    // window.__webview_engine_version__ = 0.02

    // 判断是否是mock的组件
    if (mockComponentMap[tagName]) {
        componentPath = mockComponentMap[tagName]
    }

    if (typeof componentPath === 'object') {
    // 直接传入定义对象
        const definition = componentPath

        return jComponent.register(definition)
    }

    if (typeof componentPath !== 'string') {
        throw new Error('componentPath must be a string')
    }

    if (!tagName || typeof tagName !== 'string') {
        tagName = 'main' // 默认标签名
    }

    const id = _.getId()

    if (hasRegisterCache[componentPath]) return hasRegisterCache[componentPath]
    hasRegisterCache[componentPath] = id
    let componentJsonContent = {}
    try {
        if (componentContent.json && componentContent.json.content) {
            componentJsonContent = json5.parse(componentContent.json.content)
        }
    } catch (e) {
        console.log(e)
    }


    const component = {
        id,
        path: componentPath,
        tagName,
        json: componentJsonContent,
        script: componentContent.script
    }

    if (!component.json) {
        throw new Error(`invalid componentPath: ${componentPath}`)
    }

    // 先加载 using components
    const rootPath = cache.options.rootPath
    const usingComponents = component.json.usingComponents || {}
    const overrideUsingComponents = cache.options.usingComponents || {}
    const usingComponentKeys = Object.keys(usingComponents)
    for (let i = 0, len = usingComponentKeys.length; i < len; i++) {
        const key = usingComponentKeys[i]

        if (Object.prototype.hasOwnProperty.call(overrideUsingComponents, key)) continue // 被 override 的跳过

        const value = usingComponents[key]
        const isRelativePath = /^\./.test(value)
        let usingPath = null
        if (isRelativePath) {
            usingPath = require.resolve(path.join(path.dirname(componentPath), value))
        } else {
            usingPath = require.resolve(value)
        }
        // const usingPath = _.isAbsolute(value) ? path.join(rootPath, value) : path.join(path.dirname(componentPath), value)
        const compContent = require(usingPath)
        const id = registerMpx(usingPath, key, cache, hasRegisterCache, compContent)
        usingComponents[key] = id
    }
    Object.assign(usingComponents, overrideUsingComponents)
    component.json.usingComponents = usingComponents
    // 读取自定义组件的静态内容
    // component.wxml = compile.getWxml(componentPath, cache.options)
    component.wxml = componentContent.template
    component.wxss = componentContent.style

    // 存入需要执行的自定义组件 js
    cache.needRunJsList.push([componentPath, component])

    // 保存追加了已编译的 wxss
    cache.wxss.push(wxss.compile(component.wxss, {
        prefix: tagName,
        ...cache.options,
    }))

    return component.id
}

/**
 * 加载自定义组件
 */
function load(componentPath, tagName, options = {}) {
    if (typeof tagName === 'object') {
        options = tagName
        tagName = ''
    }

    if (typeof componentPath === 'string') {
        options = Object.assign({
            compiler: 'official', // official - 官方编译器、simulate - 纯 js 实现的模拟编译器
            rootPath: path.dirname(componentPath), // 项目根路径
        }, options)
    } else {
        options = Object.assign({
            compiler: 'simulate',
            rootPath: '',
        }, options)
    }

    const cache = {
        wxss: [],
        options,
        needRunJsList: [],
    }
    const hasRegisterCache = {}
    const id = register(componentPath, tagName, cache, hasRegisterCache)

    // 执行自定义组件 js
    cache.needRunJsList.forEach(item => {
        const oldLoad = nowLoad

        nowLoad = item[1] // nowLoad 用于执行用户代码调用 Component 构造器时注入额外的参数给 j-component
        nowLoad.pathToIdMap = hasRegisterCache
        _.runJs(item[0])

        nowLoad = oldLoad
    })

    // 存入缓存
    componentMap[id] = cache

    return id
}

/**
 * 加载 Mpx 组件
 * @param componentPath
 * @param tagName
 * @param options
 */
function loadMpx(componentPath, tagName, options = {}) {
    if (typeof tagName === 'object') {
        options = tagName
        tagName = ''
    }

    if (typeof componentPath === 'string') {
        options = Object.assign({
            compiler: 'official', // official - 官方编译器、simulate - 纯 js 实现的模拟编译器
            rootPath: path.dirname(componentPath), // 项目根路径
        }, options)
    } else {
        options = Object.assign({
            compiler: 'simulate',
            rootPath: '',
        }, options)
    }

    const cache = {
        wxss: [],
        options,
        needRunJsList: [],
    }
    const hasRegisterCache = {}
    // mock webpack 以及 mpx 相关对象
    this.cacheable = () => {}
    let id = null
    const componentContent = require(componentPath)
    id = registerMpx(componentPath, tagName, cache, hasRegisterCache, componentContent)
    // 执行自定义组件 js
    cache.needRunJsList.forEach(item => {
        const oldLoad = nowLoad

        nowLoad = item[1] // nowLoad 用于执行用户代码调用 Component 构造器时注入额外的参数给 j-component
        nowLoad.pathToIdMap = hasRegisterCache
        /**
     *  这里要require一个js文件，但是js文件内容目前存在于内存中，直接require文件是会报找不到文件错误，但是如果要走require from string，则又面临jest runtime中
     *  暂时不支持 es module 规范的问题，势必需要先经过 babel transform-esModule-to-commonjs，怎么保证所有文件都经过babel处理又是一个问题。
     */
        /**
     * 这里的解决方案为，当require 一个 mpx文件之后，把对应的cache删除，再次走require进入jest-mpx中，return出script对应的content来实现js部分run的效果
     * 在删除cache时发现，jest是自己实现的moduleRequire, require.cache 并不是一个对象, 而是一个 Proxy，这里删除cache又费了一番功夫
     *
     * 修改cache的过程发现关于缓存的地方太多，修改起来整体流程不可控，以及缓存改动后对于整体构建速度可能会有影响，所以这里准备再次回归require from string 方式，让
     * 走node原生require的形式也都走一遍 jest transform。
     */
        const _require = require
        const copyRequire = (moduleName) => {
            if (_require && _require.resolve && moduleName.includes('./')) {
                const basePath = _require.resolve(nowLoad.path)
                const basePathDir = path.dirname(basePath) + '/'
                const absolutePath = _require.resolve(moduleName, {paths: [basePathDir]})
                return _require(absolutePath)
            }
            return _require(moduleName)
        }
        copyRequire.resolve = _require.resolve
        requireFromString.require(nowLoad.script, nowLoad.path, copyRequire)
        nowLoad = oldLoad
    })
    return id
}

/**
 * 渲染自定义组件
 */
function render(id, properties) {
    if (!id) throw new Error('you need to pass the componentId')

    const cache = componentMap[id]

    if (cache) {
    // 注入 wxss
        wxss.insert(cache.wxss, id)
    }

    const component = jComponent.create(id, properties)

    return component
}

/**
 * 比较 dom 节点是否符合某个 html 结构
 */
function match(dom, html) {
    if (!(dom instanceof window.Element) || !html || typeof html !== 'string') return false

    // 干掉一些换行符，以免生成不必要的 TextNode
    html = html.trim()
        .replace(/(>)[\n\r\s\t]+(<)/g, '$1$2')

    const a = dom.cloneNode()
    const b = dom.cloneNode()

    a.innerHTML = dom.innerHTML
    b.innerHTML = html

    return a.isEqualNode(b)
}

/**
 * 让线程等待一段时间再执行
 */
function sleep(time = 0) {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve()
        }, time)
    })
}

/**
 * mock usingComponents中的组件
 * @param compName
 * @param compDefinition
 */
function mockComponent(compName, compDefinition) {
    mockComponentMap[compName] = compDefinition
}

/**
 * 清除 component mock 数据
 */
function clearMockComponent() {
    mockComponentMap = {}
}

/**
 * 模拟滚动
 */
function scroll(comp, destOffset = 0, times = 20, propName = 'scrollTop') {
    if (!comp || !comp.dom) throw new Error('invalid params')
    if (typeof times !== 'number' || times <= 0) times = 1

    destOffset = destOffset < 0 ? 0 : destOffset

    const dom = comp.dom
    const delta = destOffset - dom[propName]
    // eslint-disable-next-line no-bitwise
    const unit = ~~(delta / times)
    const env = _.getEnv()

    if (env === 'nodejs') {
        for (let i = 0; i < times; i++) {
            // nodejs 环境
            setTimeout(() => {
                if (i === times - 1) dom[propName] = destOffset
                else dom[propName] += unit

                // 模拟异步触发
                dom.dispatchEvent(new Event('scroll', {bubbles: true, cancelable: false}))
            }, 0)
        }
    } else {
    // 浏览器
        dom[propName] = destOffset
    }
}

injectPolyfill()
injectDefinition()

module.exports = {
    behavior,
    load,
    loadMpx,
    render,
    match,
    sleep,
    scroll,
    mockComponent,
    clearMockComponent
}
