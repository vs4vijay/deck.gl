// Copyright (c) 2015 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

import BaseMapLayer from '../base-map-layer';
import {Program} from 'luma.gl';
const glslify = require('glslify');

export default class HexagonLayer extends BaseMapLayer {
  /**
   * @classdesc
   * HexagonLayer
   *
   * @class
   * @param {object} opts
   *
   * @param {number} opts.dotRadius - hexagon radius
   * @param {number} opts.elevation - hexagon height
   *
   * @param {function} opts.onHexagonHovered(index, e) - popup selected index
   * @param {function} opts.onHexagonClicked(index, e) - popup selected index
   */
  constructor(opts) {
    super({
      dotRadius: 10,
      elevation: 101,
      ...opts
    });

    this.onObjectHovered = opts.onHexagonHovered;
    this.onObjectClicked = opts.onHexagonClicked;
  }

  initializeState() {
    super.initializeState();

    const {gl} = this.state;

    const program = new Program(
      gl,
      glslify('./vertex.glsl'),
      glslify('./fragment.glsl'),
      'hexagon'
    );

    Object.assign(this.state, {
      program,
      primitive: this.getPrimitive()
    });
  }

  getPrimitive() {
    const NUM_SEGMENTS = 6;
    const PI2 = Math.PI * 2;

    let vertices = [];
    for (let i = 0; i < NUM_SEGMENTS; i++) {
      vertices = [
        ...vertices,
        Math.cos(PI2 * i / NUM_SEGMENTS),
        Math.sin(PI2 * i / NUM_SEGMENTS),
        0
      ];
    }

    return {
      id: this.id,
      drawType: 'TRIANGLE_FAN',
      vertices: new Float32Array(vertices),
      instanced: true
    };
  }

  updateLayer() {
    const {dataChanged, viewportChanged} = this.state;
    if (dataChanged) {
      this._allocateGLBuffers();
      this._calculatePositions();
      this._calculateColors();
      this._calculatePickingColors();
    }

    if (viewportChanged || dataChanged) {
      this._calculateRadiusAndAngle();
    }

    this.updateUniforms();
    this.updateAttributes();

    this.state.dataChanged = false;
    this.state.viewportChanged = false;
  }

  updateUniforms() {
    const {uniforms} = this.state;
    uniforms.radius = this.state.radius;
    uniforms.angle = this.state.angle;
  }

  updateAttributes() {
    const {attributes} = this.state;
    attributes.positions = {value: this.state.positions, instanced: 1, size: 3};
    attributes.colors = {value: this.state.colors, instanced: 1, size: 3};

    if (!this.isPickable) {
      return;
    }

    attributes.pickingColors = {
      value: this.state.pickingColors,
      instanced: 1,
      size: 3
    };
  }

  _allocateGLBuffers() {
    const N = this._numInstances;
    this.state.positions = new Float32Array(N * 3);
    this.state.colors = new Float32Array(N * 3);

    if (!this.isPickable) {
      return;
    }

    this.state.pickingColors = new Float32Array(N * 3);
  }

  _calculatePositions() {
    this.props.data.forEach((hexagon, i) => {
      this.state.positions[i * 3 + 0] = hexagon.centroid.x;
      this.state.positions[i * 3 + 1] = hexagon.centroid.y;
      this.state.positions[i * 3 + 2] = this.elevation;
    });
  }

  _calculateColors() {
    this.props.data.forEach((hexagon, i) => {
      this.state.colors[i * 3 + 0] = hexagon.color[0];
      this.state.colors[i * 3 + 1] = hexagon.color[1];
      this.state.colors[i * 3 + 2] = hexagon.color[2];
    });
  }

  // TODO this is the only place that uses hexagon vertices
  // consider move radius and angle calculation to the shader
  _calculateRadiusAndAngle() {
    if (!this.props.data || this.props.data.length === 0) {
      return;
    }

    const vertices = this.props.data[0].vertices;
    const vertex0 = vertices[0];
    const vertex3 = vertices[3];

    // transform to space coordinates
    const spaceCoord0 = this.project([vertex0[0], vertex0[1]]);
    const spaceCoord3 = this.project([vertex3[0], vertex3[1]]);

    // map from space coordinates to screen coordinates
    const screenCoord0 = this.screenToSpace(spaceCoord0.x, spaceCoord0.y);
    const screenCoord3 = this.screenToSpace(spaceCoord3.x, spaceCoord3.y);

    // distance between two close centroids
    const dx = screenCoord0.x - screenCoord3.x;
    const dy = screenCoord0.y - screenCoord3.y;
    const dxy = Math.sqrt(dx * dx + dy * dy);

    // Calculate angle that the perpendicular hexagon vertex axis is tilted
    this.state.angle = Math.acos(dx / dxy) * -Math.sign(dy);

    // Allow user to fine tune radius
    this.state.radius = dxy / 2 * Math.min(1, this.radius);
  }

}