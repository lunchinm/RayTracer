# RayTracer Web 项目规划文档

## 项目概述

一个基于浏览器的光线追踪渲染器，用户可以通过 Web 界面创建/编辑 3D 场景，设置材质和光照，然后启动光线追踪渲染并查看结果。

- **GitHub 仓库**: https://github.com/lunchinm/RayTracer
- **部署目标**: 通过链接直接访问（GitHub Pages 或类似静态托管）
- **技术栈**: TypeScript + Three.js + WebGPU

---

## 功能需求

### 1. 场景编辑器（左栏）

#### 1.1 3D 视口
- Three.js 实时渲染场景预览
- 鼠标拖拽移动物体（平移）
- 鼠标滚轮缩放
- 右键旋转视角
- 支持选中高亮

#### 1.2 场景层级面板
- 显示场景中所有物体列表
- 支持多选、删除
- 点击选中物体，在视口中高亮

#### 1.3 添加物体
- 预设几何体：球体、立方体、平面（地面）、**圆柱**、**胶囊体**
- 后续可扩展：导入 OBJ 模型

#### 1.5 坐标和变换编辑
- 选中物体后，在右栏（或弹出面板）显示其变换参数：
  - **位置（Position）**：X / Y / Z 输入框，支持精确修改
  - **旋转（Rotation）**：X / Y / Z 输入框（角度制）
  - **缩放（Scale）**：X / Y / Z 输入框（统一缩放锁定可选）
- 支持在 3D 视口中通过 Gizmo 拖拽修改（平移/旋转/缩放）
- 修改坐标后实时更新 Three.js 预览视口

#### 1.4 材质系统
- 三种材质类型：
  - **漫反射（Diffuse）**：颜色、漫反射系数
  - **镜面反射（Specular/Mirror）**：颜色、反射率、光泽度
  - **透明（Transparent）**：颜色、折射率、IOR、吸收颜色、**反射率**（Fresnel 效应，侧面更反射）
- 材质面板：可拖拽材质到物体上
- 支持修改物体颜色（独立于此材质系统，快速改色）
- **Three.js 预览视口中的材质视觉效果**（非光追，仅用于编辑预览）：
  - 漫反射：`MeshLambertMaterial`，显示受光照影响的平坦颜色
  - 镜面反射：`MeshStandardMaterial({ metalness: 1, roughness: 0 })` + 环境贴图，呈现镜面高光
  - 透明：`MeshPhysicalMaterial({ transmission: 0.9, roughness: 0 })` 或 `transparent: true + opacity`，模拟折射效果
  - 目的：让用户在未启用光追渲染时，也能直观区分不同材质类型

### 2. 渲染设置（右栏 - 常规模式）

#### 2.1 渲染参数
- 输出分辨率（宽度 × 高度）
- 最大弹射深度（递归深度）
- 反走样采样数（AA Samples）
- 终止能量阈值

#### 2.2 光照设置
- 方向光：颜色、亮度、**方向 X/Y/Z**（通过 UI 滑块控制）
- 环境光：颜色、强度
- 光源方向滑块拖拽时 **Three.js 预览视口实时同步**

#### 2.3 BVH 开关
- 复选框：启用/禁用 BVH 加速结构
- 显示 BVH 构建时间和统计信息

#### 2.4 GPU 加速开关
- 复选框：启用/禁用 WebGPU 加速
- 若浏览器不支持 WebGPU，显示降级提示（回退到 CPU）

#### 2.5 日志输出
- 渲染进度（百分比）
- 渲染耗时
- 射线总数、求交次数
- BVH 统计（节点数、深度等）

### 3. 渲染流程

1. 用户按 `R` 键或点击「开始渲染」按钮
2. 右栏切换为「渲染进度」视图
3. 逐步渲染（渐进式），实时更新进度
4. 渲染完成后，右栏显示为渲染结果图片
5. 可点击「保存图片」下载 PNG

---

## 技术架构

### 目录结构

```
RayTracer/
├── index.html              # 入口页面
├── package.json            # 依赖配置
├── tsconfig.json           # TypeScript 配置
├── vite.config.ts          # Vite 构建配置
├── src/
│   ├── main.ts             # 应用入口
│   ├── App.ts             # 主应用逻辑
│   ├── components/
│   │   ├── SceneEditor.ts  # 左栏：场景编辑器
│   │   ├── RenderPanel.ts  # 右栏：渲染设置和结果
│   │   └── Toolbar.ts      # 顶部工具栏
│   ├── raytracer/
│   │   ├── RayTracer.ts    # 核心光追引擎（CPU）
│   │   ├── GPURayTracer.ts # WebGPU 光追引擎
│   │   ├── BVH.ts          # BVH 加速结构
│   │   ├── Geometry.ts     # 几何体重心（三角形、球体）
│   │   ├── Material.ts     # 材质定义
│   │   └── Camera.ts      # 相机模型
│   ├── scene/
│   │   ├── Scene.ts        # 场景图管理
│   │   └── GameObject.ts   # 场景物体
│   └── utils/
│       └── Logger.ts       # 日志工具
├── public/
│   └── favicon.svg
└── PLAN.md               # 本文件
```

### 核心技术选型

| 模块 | 技术 | 理由 |
|------|------|------|
| 构建工具 | Vite | 快速 HMR，原生 TS 支持 |
| 3D 视口 | Three.js | 成熟、文档丰富、支持拖拽交互 |
| UI 布局 | 自定义 CSS + HTML | 轻量，左右分栏布局 |
| CPU 光追 | 纯 TypeScript（先用） | 易调试，开发速度快，课程作业 320×240 分辨率够用 |
| WASM 优化 | 后续按需加入（C++ → WASM） | 性能提升 5-10 倍，TypeScript 逻辑可直接迁移 |
| GPU 光追 | WebGPU API | 现代标准，Compute Shader 支持 |
| 部署 | GitHub Pages | 免费，直接通过链接访问 |

### 光追算法设计（参考已有 C# 代码）

#### 核心递归公式
```
I = I_local + ks * I_reflect + kt * I_refract
```

#### 主要模块
1. **射线与几何体求交**：
   - 三角形：Möller-Trumbore 算法
   - 球体：解析解（二次方程）
   - 立方体：AABB 求交（Slab 方法）
   - **圆柱**：射线与无限圆柱求交 + 上下底面裁剪
   - **胶囊体**：射线与球体（两端）+ 圆柱部分求交
2. **BVH 加速**：AABB 包围盒，最长轴分割
3. **反射**：`R = I - 2(N·I)N`
4. **折射**：Snell 定律 + 全反射判断
5. **阴影**：Shadow Ray 检测
6. **反走样**：超采样（N×N 子采样取平均）
7. **Fresnel 效应**：Schlick 近似
8. **Beer-Lambert 吸收**：透明介质内部光程衰减

#### BVH 开关设计
- `useBVH: boolean` 参数
- 禁用时回退到暴力遍历（逐个三角形求交）
- UI 上复选框控制，实时生效

#### GPU 开关设计
- 检测浏览器 WebGPU 支持：`navigator.gpu !== undefined`
- 启用时：使用 `GPUComputePass` 并行处理像素
- 禁用时：使用 CPU 逐像素渲染（可分块渐进式）
- UI 上复选框控制，不支持时禁用并显示提示

---

## 实现阶段（分阶段）

> **验收规则**：每个 Phase 完成后，由我来更新状态为 `🔒 待验收`。用户验收通过并说"可以了"后，我来标记 `✅ 已验收`，然后进入下一个 Phase。**我不会在用户确认前自行标记已验收。**

### Phase 1：基础框架 — ✅ 已验收 (2026-06-22)

#### 项目基础设施
- [x] 初始化项目（Vite + TypeScript）
- [x] 搭建左右分栏 UI（暗色主题）
- [x] GitHub Pages 自动部署（push main → Actions → gh-pages）

#### 3D 视口
- [x] 集成 Three.js + WebGLRenderer
- [x] OrbitControls：左键平移 / 右键旋转 / 中键+滚轮缩放
- [x] TransformControls Gizmo（平移/旋转/缩放三模式切换）
- [x] 网格线 + 方向光 + 环境光 + 阴影地面
- [x] XYZ 坐标方向指示器（右上角，3D ArrowHelper + Sprite 标签，跟随相机旋转，中心原点固定，透明背景）
- [x] 物体选中高亮（轮廓线）

#### 场景图管理
- [x] 5 种预设几何体：球体、立方体、平面、圆柱、胶囊体
- [x] 添加 / 删除物体（支持 Delete/Backspace 快捷键）
- [x] 点击选中物体（Raycaster）
- [x] 场景层级列表（显示所有物体，点击选中，双击重命名）

#### 变换编辑
- [x] 位置 X/Y/Z 输入框
- [x] 旋转 X/Y/Z 输入框（角度制）
- [x] 缩放 X/Y/Z 输入框
- [x] 物体名称编辑（输入框 300ms 防抖 + 层级列表双击内联编辑）

#### 材质系统
- [x] 三色材质拖拽面板：漫反射（Diffuse）/ 镜面（Specular）/ 透明（Transparent）
- [x] 拖拽材质到物体上实时切换（Three.js 预览视口同步外观）
- [x] 颜色选择器（快速改色）

#### 渲染设置面板
- [x] 分辨率下拉框（9 档：320×240 ~ 2560×1600）
- [x] 最大弹射深度 / AA 采样数 / 终止能量阈值
- [x] 方向光颜色+亮度 / 环境光颜色+强度
- [x] BVH 开关 / GPU 开关（UI 就绪，逻辑待 Phase 4）
- [x] R 键触发渲染（UI 就绪，渲染逻辑待 Phase 2）

### Phase 2：CPU 光追核心 — ✅ 已验收
- [x] 实现几何体顶点生成（5种几何体→三角形，参考 Unity Assets/Scripts 参数）
- [x] 实现射线-三角形求交（Möller-Trumbore 算法）
- [x] 实现暴力场景遍历（所有三角形逐个测试，BVH 待 Phase 4）
- [x] 实现 Phong 局部光照（环境光 + 漫反射 + 高光）
- [x] 实现 Shadow Ray 阴影检测
- [x] 实现反走样超采样（AA 1x/2x/4x/8x）
- [x] 实现渐进式渲染（行级 yield，实时进度报告）
- [x] 渲染结果输出到 Canvas + Gamma 校正
- [x] R 键/按钮 启动渲染，保存 PNG 按钮
- [x] 光源方向 X/Y/Z 滑块 + 实时预览同步
- [x] 场景 + 渲染参数 localStorage 持久化（刷新保留）
- [x] Three.js 相机同步到光追相机
- [x] 递归弹射框架（dtraceRay 含 depth/weight/Russian Roulette）

### Phase 3：完整材质和光照 — 🔲 未开始
- [ ] 实现递归镜面反射（`ks * I_reflect`）
- [ ] 实现递归透明/折射（`kt * I_refract` + Snell + 全反射）
- [x] ~~实现 Shadow Ray 阴影~~ → 已在 Phase 2 提前完成
- [ ] 实现多重弹射（递归深度遍历，完整渲染方程）
- [x] ~~光照参数可配置~~ → 方向光颜色/亮度/方向 + 环境光颜色/强度，实时滑块

### Phase 4：BVH 和 GPU 加速 — 🔲 未开始
- [ ] 实现 BVH 加速结构
- [ ] BVH 开关 UI
- [ ] 实现 WebGPU 光追路径
- [ ] GPU 开关 UI

### Phase 5：完善和部署 — 🔲 未开始
- [x] ~~反走样（AA）~~ → 已在 Phase 2 提前完成（超采样）
- [x] ~~进度显示和日志~~ → 已在 Phase 2 提前完成
- [x] ~~保存 PNG 功能~~ → 已在 Phase 2 提前完成
- [x] ~~GitHub Pages 部署配置~~ → 已在 Phase 1 完成
- [ ] 响应式布局优化

### 额外已实现
- [x] 场景空启动（无默认演示物体）
- [x] 新建物体默认白色 (#ffffff)
- [x] 场景物体 localStorage 持久化（raytracer_scene）
- [x] 渲染参数 localStorage 持久化（raytracer_settings，10项）
- [x] 光源方向 Three.js 预览视口实时同步

### 状态图例

| 符号 | 含义 |
|------|------|
| 🔲 未开始 | 尚未进入开发 |
| 🚧 开发中 | 正在进行代码实现 |
| 🔒 待验收 | 代码已完成，等待用户确认 |
| ✅ 已验收 | 用户确认通过，可进入下一阶段 |

---

## UI 设计草图

```
┌──────────────────────────────────────────────────────────┐
│  工具栏：添加物体 [球体][立方体][平面]  [开始渲染 R]     │
├───────────────────────┬──────────────────────────────────┤
│                       │                                  │
│   3D 视口            │   渲染设置 / 渲染结果            │
│   （Three.js）        │                                  │
│                       │   [常规模式]                    │
│   ┌─────────────┐    │   - 分辨率设置                  │
│   │             │    │   - 最大弹射深度                │
│   │   场景预览   │    │   - AA 采样数                  │
│   │             │    │   - 光照颜色和亮度              │
│   │   (可拖拽)  │    │   - ☑ 启用 BVH                │
│   │             │    │   - ☑ 启用 GPU                 │
│   └─────────────┘    │                                  │
│                       │   [日志输出]                    │
│   场景层级            │   - 渲染进度...                 │
│   □ 球体1            │   - BVH 统计...                 │
│   □ 立方体1          │                                  │
│                       │                                  │
│   材质面板            │   [渲染完成后显示图片]          │
│   - 漫反射 (颜色)    │   ┌────────────────┐           │
│   - 镜面反射         │   │                │           │
│   - 透明             │   │   渲染结果      │           │
│                       │   │                │           │
│                       │   └────────────────┘           │
│                       │                                  │
│   [选中物体时显示]    │                                  │
│   变换编辑            │                                  │
│   - 位置 X Y Z      │                                  │
│   - 旋转 X Y Z      │                                  │
│   - 缩放 X Y Z      │                                  │
├───────────────────────┴──────────────────────────────────┤
│  状态栏：FPS | 物体数 | 最后操作                        │
└──────────────────────────────────────────────────────────┘
```

---

## 部署方案

### GitHub Pages 配置
1. `vite.config.ts` 中设置 `base: '/RayTracer/'`
2. 构建输出到 `dist/` 目录
3. GitHub Actions 自动部署：
   - 监听 `main` 分支 push
   - 运行 `npm run build`
   - 部署到 `gh-pages` 分支
4. 访问链接：`https://lunchinm.github.io/RayTracer/`

### 本地开发
```bash
npm install
npm run dev      # 启动开发服务器
npm run build    # 构建生产版本
npm run preview  # 预览生产版本
```

---

## 参考：已有 C# 代码对应功能映射

| C# 代码 | TypeScript 对应 |
|---------|----------------|
| `RayTracer.cs` | `src/raytracer/RayTracer.ts` |
- **透明材质反射率**：透明物体也支持 `reflectivity` 参数，通过 Fresnel 效应实现（正面看透明，侧面看反射），Schlick 近似计算
| `RayTracingMaterial.cs` | `src/raytracer/Material.ts` |
| `Triangle` 结构体 | `src/raytracer/Geometry.ts` |
| `BVHNode` 类 | `src/raytracer/BVH.ts` |
| `Compute Shader` | `src/raytracer/GPURayTracer.ts` |
| `CollectSceneGeometry()` | `src/scene/Scene.ts` |
| `TraceRay()` 递归 | `RayTracer.ts::traceRay()` |

---

## 注意事项

1. **WebGPU 兼容性**：目前仅 Chrome/Edge 稳定支持，Safari 实验性支持。需要降级方案（回退 CPU）。
2. **性能预期**：纯 TypeScript CPU 光追在浏览器中性能有限，建议分辨率先从 320×240 起步，用于课程作业演示足够。
3. **渐进式渲染**：为了避免页面卡死，需要分块渲染（requestAnimationFrame 或 Web Worker）。
4. **WASM 优化（后续按需）**：若 TypeScript 版本性能不足，可将光追核心用 C++ 编写并编译为 WASM，性能提升 5-10 倍。TypeScript 逻辑可直接映射到 C++，迁移成本低。

---

_最后更新：2026-06-26 16:20_
