const { join } = require('path');

module.exports = {
    'audio-clip': join(__dirname, './assets/audio-clip.js'),
    'auto-atlas': join(__dirname, './assets/texture/auto-atlas.js'), // 复用
    'dragonbones-atlas': join(__dirname, './assets/json.js'), // 复用
    'dragonbones': join(__dirname, './assets/json.js'),  // 复用
    'effect-header': join(__dirname, './assets/effect-header.js'),
    'erp-texture-cube': join(__dirname, './assets/erp-texture-cube.js'),
    'label-atlas': join(__dirname, './assets/label-atlas.js'),
    'physics-material': join(__dirname, './assets/physics-material.js'),
    'render-pipeline': join(__dirname, './assets/render-pipeline.js'),
    'render-texture': join(__dirname, './assets/render-texture.js'),
    'sprite-frame': join(__dirname, './assets/sprite-frame.js'),
    'texture-cube': join(__dirname, './assets/texture-cube.js'),
    'video-clip': join(__dirname, './assets/video-clip.js'),
    effect: join(__dirname, './assets/effect.js'),
    fbx: join(__dirname, './assets/fbx/index.js'),
    gltf: join(__dirname, './assets/fbx/index.js'), // 复用
    image: join(__dirname, './assets/image.js'),
    javascript: join(__dirname, './assets/javascript.js'),
    json: join(__dirname, './assets/json.js'),
    material: join(__dirname, './assets/material.js'),
    particle: join(__dirname, './assets/particle.js'),
    prefab: join(__dirname, './assets/scene.js'), // 复用
    scene: join(__dirname, './assets/scene.js'),
    text: join(__dirname, './assets/text.js'),
    texture: join(__dirname, './assets/texture/index.js'),
    typescript: join(__dirname, './assets/typescript.js'),
};