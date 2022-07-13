
function objectKeys(obj) {
    return Object.keys(obj)
}

function genRegExp(str, flags) {
    return new RegExp(str, flags)
}

const mpxDashReg = genRegExp('(.+)MpxDash$')
// 转义字符在wxs正则中存在平台兼容性问题，用[$]规避使用转义字符
const mpxDashReplaceReg = genRegExp('[$]', 'g')

function extend(target, from) {
    const fromKeys = objectKeys(from)
    for (let i = 0; i < fromKeys.length; i++) {
        const key = fromKeys[i]
        target[key] = from[key]
    }
    return target
}

function concat(a, b) {
    // eslint-disable-next-line no-nested-ternary
    return a ? b ? (a + ' ' + b) : a : (b || '')
}

function isObject(obj) {
    return obj !== null && typeof obj === 'object'
}

function likeArray(arr) {
    return Array.isArray(arr)
}

function isDef(v) {
    return v !== undefined && v !== null
}

function stringifyArray(value) {
    let res = ''
    let stringified
    for (let i = 0; i < value.length; i++) {
        // eslint-disable-next-line no-use-before-define,no-cond-assign
        if (isDef(stringified = stringifyDynamicClass(value[i])) && stringified !== '') {
            if (res) res += ' '
            res += stringified
        }
    }
    return res
}

function stringifyObject(value) {
    let res = ''
    const objKeys = objectKeys(value)
    for (let i = 0; i < objKeys.length; i++) {
        let key = objKeys[i]
        if (value[key]) {
            if (res) res += ' '
            if (mpxDashReg.test(key)) {
                key = mpxDashReg.exec(key)[1].replace(mpxDashReplaceReg, '-')
            }
            res += key
        }
    }
    return res
}

function stringifyDynamicClass(value) {
    if (!value) return ''
    if (likeArray(value)) {
        return stringifyArray(value)
    }
    if (isObject(value)) {
        return stringifyObject(value)
    }
    if (typeof value === 'string') {
        return value
    }
    return ''
}

function hump2dash(value) {
    const reg = genRegExp('[A-Z]', 'g')
    return value.replace(reg, function(match) {
        return '-' + match.toLowerCase()
    })
}

function dash2hump(value) {
    const reg = genRegExp('-([a-z])', 'g')
    return value.replace(reg, function(match, p1) {
        return p1.toUpperCase()
    })
}

function parseStyleText(cssText) {
    const res = {}
    const listDelimiter = genRegExp(';(?![^(]*[)])', 'g')
    const propertyDelimiter = genRegExp(':(.+)')
    const arr = cssText.split(listDelimiter)
    for (let i = 0; i < arr.length; i++) {
        const item = arr[i]
        if (item) {
            const tmp = item.split(propertyDelimiter)
            if (tmp.length > 1) {
                const k = dash2hump(tmp[0].trim())
                res[k] = tmp[1].trim()
            }
        }
    }
    return res
}

function genStyleText(styleObj) {
    let res = ''
    const objKeys = objectKeys(styleObj)

    for (let i = 0; i < objKeys.length; i++) {
        const key = objKeys[i]
        const item = styleObj[key]
        res += hump2dash(key) + ':' + item + ';'
    }
    return res
}

function mergeObjectArray(arr) {
    const res = {}
    for (let i = 0; i < arr.length; i++) {
        if (arr[i]) {
            extend(res, arr[i])
        }
    }
    return res
}

function normalizeDynamicStyle(value) {
    if (!value) return {}
    if (likeArray(value)) {
        return mergeObjectArray(value)
    }
    if (typeof value === 'string') {
        return parseStyleText(value)
    }
    return value
}

module.exports = {
    stringifyClass(staticClass, dynamicClass) {
        if (typeof staticClass !== 'string') {
            return console.log('Template attr class must be a string!')
        }
        return concat(staticClass, stringifyDynamicClass(dynamicClass))
    },
    stringifyStyle(staticStyle, dynamicStyle) {
        const normalizedDynamicStyle = normalizeDynamicStyle(dynamicStyle)
        const parsedStaticStyle = typeof staticStyle === 'string' ? parseStyleText(staticStyle) : {}
        return genStyleText(extend(parsedStaticStyle, normalizedDynamicStyle))
    }
}
