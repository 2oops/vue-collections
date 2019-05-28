/* @flow */

import { _Set as Set, isObject } from '../util/index'
import type { SimpleSet } from '../util/index'
import VNode from '../vdom/vnode'

const seenObjects = new Set()

/**
 * Recursively traverse an object to evoke all converted
 * getters, so that every nested property inside the object
 * is collected as a "deep" dependency.
 */
export function traverse (val: any) {
  _traverse(val, seenObjects)
  seenObjects.clear()
}

function _traverse (val: any, seen: SimpleSet) {
  let i, keys
  const isA = Array.isArray(val)
  if ((!isA && !isObject(val)) || Object.isFrozen(val) || val instanceof VNode) {
    return
  }
  if (val.__ob__) {// 解决循环引用导致死循环的问题
    const depId = val.__ob__.dep.id// 如果一个响应式数据是对象或数组，那么它会包含一个叫做 __ob__ 的属性
    if (seen.has(depId)) {// 判断seen中是否已经有这个id了，没有则add
      return
    }
    seen.add(depId)
  }
  if (isA) {
    i = val.length
    // val[i]和val[keys[i]]两个参数实际上是在读取子属性的值，这将触发子属性的 get 拦截器函数，保证子属性能够收集到观察者
    while (i--) _traverse(val[i], seen)
  } else {
    keys = Object.keys(val)
    i = keys.length
    while (i--) _traverse(val[keys[i]], seen)
  }
}
