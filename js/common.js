/**
 * common.js - 项目公共脚本
 *
 * 功能概述：
 *   1. StorageManager - localStorage 安全读写封装工具（全局对象）
 *   2. 顶部导航选项卡切换逻辑（问题图谱 / 能力图谱）
 *
 * 模块结构：
 *   一、全局工具对象：StorageManager（localStorage 安全封装）
 *   二、页面初始化：选项卡切换事件绑定
 *
 * 使用方式：
 *   所有页面通过 <script src="js/common.js"></script> 引入，
 *   StorageManager 作为全局对象可直接调用。
 *
 * 依赖：
 *   无外部依赖，仅使用浏览器原生 API（localStorage、DOM）
 */

/* ============================================================
 * 一、全局工具对象：StorageManager
 *    - localStorage 安全读写封装
 *    - 自动 JSON 序列化/反序列化
 *    - 内置异常处理，避免存储满或隐私模式崩溃
 * ============================================================ */

/**
 * StorageManager - 浏览器本地存储操作封装
 *
 * 设计目的：
 *   - 统一项目中所有 localStorage 的读写操作
 *   - 自动进行 JSON 序列化/反序列化，简化调用方代码
 *   - 内置 try-catch 错误处理，避免因存储满或隐私模式导致的异常崩溃
 *   - 提供 fallback 默认值机制，读取失败时返回安全的默认值
 *
 * 使用示例：
 *   StorageManager.set('userData', { name: '张三' });       // 存储数据
 *   var data = StorageManager.get('userData', {});           // 读取数据，默认返回 {}
 *   StorageManager.remove('userData');                       // 删除数据
 */
var StorageManager = {

    /**
     * 从 localStorage 读取数据
     *
     * @param {string} key - 存储键名
     * @param {*} [fallback=null] - 读取失败或键不存在时的默认返回值
     * @returns {*} 解析后的 JavaScript 对象/值，或 fallback 默认值
     *
     * 内部逻辑：
     *   1. 调用 localStorage.getItem(key) 获取原始字符串
     *   2. 如果值为 null（键不存在），返回 fallback
     *   3. 否则通过 JSON.parse 反序列化后返回
     *   4. 任何异常（解析失败、存储不可用等）都会被捕获，返回 fallback
     */
    get: function (key, fallback) {
        if (fallback === undefined) fallback = null;
        try {
            var data = localStorage.getItem(key);
            return data !== null ? JSON.parse(data) : fallback;
        } catch (e) {
            console.warn('StorageManager.get(' + key + ') 失败:', e);
            return fallback;
        }
    },

    /**
     * 向 localStorage 写入数据
     *
     * @param {string} key - 存储键名
     * @param {*} data - 要存储的数据，可以是任意可 JSON 序列化的类型
     *
     * 内部逻辑：
     *   1. 通过 JSON.stringify 将数据序列化为字符串
     *   2. 调用 localStorage.setItem 写入
     *   3. 异常（如存储空间满）会被静默捕获并输出警告
     */
    set: function (key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            console.warn('StorageManager.set(' + key + ') 失败:', e);
        }
    },

    /**
     * 从 localStorage 删除指定键的数据
     *
     * @param {string} key - 要删除的存储键名
     *
     * 内部逻辑：
     *   1. 调用 localStorage.removeItem(key) 删除
     *   2. 异常会被静默捕获并输出警告
     */
    remove: function (key) {
        try {
            localStorage.removeItem(key);
        } catch (e) {
            console.warn('StorageManager.remove(' + key + ') 失败:', e);
        }
    }
};

/* ============================================================
 * 二、页面初始化：选项卡切换
 *    - 绑定顶部导航选项卡的点击事件
 *    - "问题图谱" → index.html
 *    - "能力图谱" → targetMapTeacher.html
 * ============================================================ */

(function () {
    'use strict';

    /**
     * 初始化顶部导航选项卡的点击切换行为
     *
     * 点击"问题图谱"选项卡 → 跳转到 index.html（问题图谱主页）
     * 点击"能力图谱"选项卡 → 跳转到 targetMapTeacher.html（能力图谱主页）
     */
    function initTabs() {
        var tabItems = document.querySelectorAll('.tab-item');

        tabItems.forEach(function (tab) {
            tab.addEventListener('click', function () {
                var tabId = this.getAttribute('data-tab');

                if (tabId === 'question') {
                    window.location.href = 'index.html';
                } else if (tabId === 'ability') {
                    window.location.href = 'targetMapTeacher.html';
                }
            });
        });
    }

    /**
     * DOMContentLoaded 事件回调
     * 页面 DOM 加载完成后初始化选项卡交互
     */
    document.addEventListener('DOMContentLoaded', function () {
        initTabs();
    });

})();
