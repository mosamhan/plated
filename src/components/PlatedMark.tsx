import Svg, { G, Path, Rect } from 'react-native-svg';

interface Props {
  size?: number;
  color: string;
}

/**
 * The Plated crossed fork-and-knife mark — the exact same geometry as the app
 * icon (assets/brand/icon-full.svg), rendered as vector so the in-app logo and
 * the home-screen icon stay pixel-consistent at any size.
 */
export function PlatedMark({ size = 24, color }: Props) {
  return (
    <Svg width={size} height={size} viewBox="-340 -340 680 680">
      {/* Fork — rotated -45° */}
      <G rotation={-45} fill={color}>
        <Rect x={-46} y={-300} width={14} height={104} rx={7} />
        <Rect x={-20} y={-300} width={14} height={104} rx={7} />
        <Rect x={6} y={-300} width={14} height={104} rx={7} />
        <Rect x={32} y={-300} width={14} height={104} rx={7} />
        <Path d="M -52 -214 L 52 -214 C 52 -182 44 -150 15 -150 L -15 -150 C -44 -150 -52 -182 -52 -214 Z" />
        <Path d="M -15 -150 L 15 -150 L 13 280 C 13 292 7 300 0 300 C -7 300 -13 292 -13 280 Z" />
      </G>
      {/* Knife — rotated +45° */}
      <G rotation={45} fill={color}>
        <Path d="M -15 -150 L 15 -150 L 13 280 C 13 292 7 300 0 300 C -7 300 -13 292 -13 280 Z" />
        <Path d="M 13 -150 L 20 -150 L 20 -262 C 20 -290 12 -306 -2 -306 C -12 -306 -19 -298 -19 -286 L -13 -150 Z" />
      </G>
    </Svg>
  );
}
