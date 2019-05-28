/* @flow */
// 异步更新队列：时修改很多属性的值，如果每次属性值的变化都要重新渲染，就会导致严重的性能问题，
// 而异步更新队列就是用来解决这个问题
import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  noop
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  lazy: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function;
  getter: Function;
  value: any;

  constructor (
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean
  ) {
    this.vm = vm
    if (isRenderWatcher) {// 只有在 mountComponent 函数中创建渲染函数观察者时这个isRenderWatcher参数为真
      vm._watcher = this
    }
    vm._watchers.push(this)// 渲染函数的观察者和非渲染函数的观察者，都会push进来
    // options
    if (options) {
      this.deep = !!options.deep
      this.user = !!options.user// 标识当前观察者实例对象是 开发者定义的 还是 内部定义的
      this.lazy = !!options.lazy// 原设计为computed
      this.sync = !!options.sync// 告诉观察者当数据变化时是否同步求值并执行回调，默认不会
      this.before = options.before// 以理解为 Watcher 实例的钩子,beforeUpdate
    } else {
      this.deep = this.user = this.lazy = this.sync = false
    }
    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    this.dirty = this.lazy // for lazy watchers 计算属性是惰性求值 computed->lazy
    this.deps = []
    this.newDeps = []
    this.depIds = new Set()
    this.newDepIds = new Set()
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''// 生产环境下expression为空字符串
    // parse expression for getter
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn
    } else {
      this.getter = parsePath(expOrFn)// parsePath 返回的新函数将作为 this.getter 的值
      if (!this.getter) {
        this.getter = noop
        // Watcher 只接受简单的点(.)分隔路径，如果你要用全部的 js 语法特性直接观察一个函数即可
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }
    this.value = this.lazy// 除lazy之外的所有观察者实例对象都将调用this.get()
      ? undefined
      : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   */
  get () {// 正是因为对被观察目标的求值才得以触发数据属性的 get 拦截器函数
    pushTarget(this)
    let value
    const vm = this.vm
    try {
      value = this.getter.call(vm, vm)
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      if (this.deep) {
        traverse(value)// 深度监听
      }
      popTarget()
      this.cleanupDeps()
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   */
  addDep (dep: Dep) {
    const id = dep.id
    // 重新求值时不能用newDepIds的原因是 每一次求值之后 newDepIds 属性都会被清空，见cleanupDeps()
    if (!this.newDepIds.has(id)) {// 无论一个数据属性被读取了多少次，对于同一个观察者它只会收集一次
      this.newDepIds.add(id)// newDepIds 属性用来避免在 一次求值 的过程中收集重复的依赖
      this.newDeps.push(dep)
      if (!this.depIds.has(id)) {// depIds 属性是用来在 多次求值 中避免收集重复依赖的
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  cleanupDeps () {
    let i = this.deps.length
    while (i--) {
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  update () {
    // computed: {
    //   compA () {
    //     return this.a +1
    //   }
    // }

    // 计算属性 compA 依赖了数据对象的 a 属性，那么属性 a 将收集计算属性 compA 的 计算属性观察者对象，
    // 而 计算属性观察者对象 将收集 渲染函数观察者对象
    /* istanbul ignore else */
    if (this.lazy) {// 本质上计算属性观察者对象就是一个桥梁，它搭建在响应式数据与渲染函数观察者中间
      this.dirty = true
    } else if (this.sync) {
      this.run()
    } else {
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run () {
    if (this.active) {
      const value = this.get()
      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        // set new value
        const oldValue = this.value
        this.value = value
        if (this.user) {
          try {
            this.cb.call(this.vm, value, oldValue)
          } catch (e) {
            handleError(e, this.vm, `callback for watcher "${this.expression}"`)
          }
        } else {
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  evaluate () {// 评估，作用就是用来手动求值的
    this.value = this.get()
    this.dirty = false// 实际上 this.dirty 属性也是为计算属性准备的，
    // 由于计算属性是惰性求值，所以在实例化计算属性的时候 this.dirty 的值会被设置为 true，
    // 代表着还没有求值，后面当真正对计算属性求值时，也就是执行如上代码时才会将 this.dirty 设置为 false，
    // 代表着已经求过值了
  }

  /**
   * Depend on all deps collected by this watcher.
   */
  depend () {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  teardown () {// 拆除
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      // 如果组件没有被销毁，那么将当前观察者实例从组件实例对象的 vm._watchers 数组中移除
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
