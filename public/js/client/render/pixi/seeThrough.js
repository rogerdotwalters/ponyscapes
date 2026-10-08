'use strict';
/* CLIENT (Pixi backend) - the see-through effect: a building (or a wall someone built) that stands in front of you is cut away softly around
 * you, so you are never hidden behind it. The canvas backend has no such effect. It is a filter on just those sprites: their alpha falls from
 * `floor` at the centre of an ellipse round the player to 1 at its rim. The centre and size are in device pixels, set once a frame. */
const SeeThrough = (() => {
  const FRAGMENT = `
    in vec2 vTextureCoord;
    out vec4 finalColor;
    uniform sampler2D uTexture;
    uniform highp vec4 uInputSize;
    uniform highp vec4 uOutputFrame;
    uniform vec2 uCenter;          // the player, in device pixels
    uniform vec2 uRadii;           // the ellipse's inner (fully cut) and outer (untouched) reach, horizontally
    uniform vec2 uShape;           // vertical stretch of the ellipse, minimum alpha
    void main(void) {
      vec2 pixel = uOutputFrame.xy + vTextureCoord * uInputSize.xy;
      vec2 d = (pixel - uCenter) / vec2(1.0, uShape.x);
      float t = smoothstep(uRadii.x, uRadii.y, length(d));
      finalColor = texture(uTexture, vTextureCoord) * mix(uShape.y, 1.0, t);
    }`;

  function create() {
    const filter = new PIXI.Filter({
      glProgram: PIXI.GlProgram.from({ vertex: PIXI.defaultFilterVert, fragment: FRAGMENT, name: 'see-through' }),
      resources: { seeThrough: { uCenter: { value: new Float32Array([0, 0]), type: 'vec2<f32>' }, uRadii: { value: new Float32Array([40, 90]), type: 'vec2<f32>' }, uShape: { value: new Float32Array([1.35, 0.06]), type: 'vec2<f32>' } } },
      resolution: 1, antialias: 'off',
    });
    const u = filter.resources.seeThrough.uniforms;
    return {
      filter,
      /** Where the hole is: centre (device px), reach (device px), as the inner and outer radius. */
      set(cx, cy, inner, outer) { u.uCenter[0] = cx; u.uCenter[1] = cy; u.uRadii[0] = inner; u.uRadii[1] = outer; },
    };
  }
  return { create };
})();
