/** @jsxImportSource @revideo/2d/lib */
import {Audio, Circle, Line, Node, Rect, Txt, Video, makeScene2D} from '@revideo/2d';
import {useScene, waitFor} from '@revideo/core';

import type {FactPack, GeoJson, Manifest, Shot} from './types.js';

const fallback: Manifest = {
  project: 'PropShop music-video explainer',
  render: {width: 1920, height: 1080, fps: 24, durationSeconds: 1},
  style: {
    palette: ['#17130F', '#E8B44A', '#C54B32', '#D9D2C3'],
    typefaces: ['sans-serif'],
    texture: 'freight stencil',
  },
  shots: [{
    id: 'title', kind: 'title', startSeconds: 0, endSeconds: 1,
    purpose: 'Fallback title', onScreenText: ['PROPSHOP'], factIds: [], assets: [],
  }],
};

function textFor(shot: Shot, facts: FactPack) {
  if (shot.onScreenText.length > 0) return shot.onScreenText;
  return shot.factIds
    .map(id => facts.claims.find(claim => claim.id === id)?.text)
    .filter((value): value is string => Boolean(value));
}

function mapPoints(geojson: GeoJson): Array<[number, number]> {
  const coordinates = geojson.features?.find(
    feature => feature.geometry?.type === 'LineString',
  )?.geometry?.coordinates;
  if (!coordinates || coordinates.length < 2) return [[-720, 250], [-300, 20], [100, 90], [700, -220]];
  const xs = coordinates.map(point => point[0]);
  const ys = coordinates.map(point => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return coordinates.map(([x, y]) => [
    -720 + ((x - minX) / Math.max(maxX - minX, 1)) * 1440,
    280 - ((y - minY) / Math.max(maxY - minY, 1)) * 560,
  ]);
}

export default makeScene2D('manifest-production', function* (view) {
  const manifest = useScene().variables.get<Manifest>('manifest', fallback)();
  const facts = useScene().variables.get<FactPack>('facts', {claims: []})();
  const geojson = useScene().variables.get<GeoJson>('geojson', {})();
  const performanceClips = useScene().variables.get<Record<string, string>>('performanceClips', {})();
  const masterAudio = useScene().variables.get<string>('masterAudio', '')();
  const [ink, signal, rust, paper] = manifest.style.palette;
  const font = manifest.style.typefaces.join(', ');
  const canonicalScale = Math.min(manifest.render.width / 1920, manifest.render.height / 1080);
  const stage = new Node({scale: canonicalScale});
  view.add(stage);
  if (masterAudio) view.add(<Audio src={masterAudio} play volume={1} />);

  for (const shot of manifest.shots) {
    stage.removeChildren();
    const duration = shot.endSeconds - shot.startSeconds;
    const labels = textFor(shot, facts);

    stage.add(<Rect width={1920} height={1080} fill={ink} />);
    stage.add(
      <Txt
        text={`${shot.kind.toUpperCase()} / ${shot.id}`}
        fill={paper}
        opacity={0.58}
        fontFamily={font}
        fontSize={28}
        letterSpacing={5}
        position={[-700, -450]}
      />,
    );

    if (shot.kind === 'performance') {
      const clip = performanceClips[shot.id];
      if (clip) {
        stage.add(
          <Video
            src={clip}
            width={1920}
            height={1080}
            play
            volume={0}
            decoder={'web'}
          />,
        );
      } else {
        stage.add(<Circle size={570} fill={rust} opacity={0.3} />);
        stage.add(<Circle size={82} fill={paper} position={[-105, -40]} />);
        stage.add(<Circle size={82} fill={paper} position={[105, -40]} />);
        stage.add(<Rect width={270} height={72} radius={36} fill={signal} position={[0, 125]} />);
        stage.add(
          <Txt
            text={'PERFORMANCE CLIP SLOT'}
            fill={paper}
            fontFamily={font}
            fontWeight={700}
            fontSize={46}
            position={[0, 390]}
          />,
        );
      }
    } else if (shot.kind === 'map') {
      const points = mapPoints(geojson);
      stage.add(<Line points={points} stroke={rust} lineWidth={44} opacity={0.25} />);
      stage.add(<Line points={points} stroke={signal} lineWidth={12} />);
      for (const point of points) stage.add(<Circle position={point} size={32} fill={paper} stroke={ink} lineWidth={6} />);
    } else if (shot.kind === 'metric') {
      stage.add(<Rect width={1320} height={34} fill={paper} opacity={0.18} position={[0, 140]} />);
      stage.add(<Rect width={980} height={34} fill={signal} position={[-170, 140]} />);
      stage.add(<Rect width={1320} height={2} fill={paper} opacity={0.45} position={[0, 240]} />);
    }

    if (labels.length > 0) {
      labels.forEach((label, index) => {
        const titleSize = index === 0 ? 126 : 54;
        const baseY = shot.kind === 'metric' ? -130 : shot.kind === 'map' ? 365 : 0;
        const titleY = index === 0 ? -55 : 95 + (index - 1) * 70;
        const stackedY = baseY + (index - (labels.length - 1) / 2) * 90;
        stage.add(
          <Txt
            text={label}
            fill={paper}
            fontFamily={font}
            fontWeight={700}
            fontSize={shot.kind === 'title' ? titleSize : 74}
            textAlign={'center'}
            width={1500}
            position={[0, shot.kind === 'title' ? titleY : stackedY]}
          />,
        );
      });
    }
    yield* waitFor(duration);
  }
});
