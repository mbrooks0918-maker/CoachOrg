// Framework-agnostic React mark. Scales to any size; dots grow slightly below 32px.
export function TeamOpsMark({ size = 40, tile = '#0c140c', dot = '#65c86b', radius = '22.7%', ...rest }) {
  const small = size < 32;
  const d = small ? 27 : 22;          // dot diameter, % of tile
  const o = (100 - d) / 2;            // centering offset
  const e = small ? 11 : 15;          // edge inset
  const pos = [
    { left: o + '%', top: e + '%' },
    { left: 100 - e - d + '%', top: o + '%' },
    { left: o + '%', top: 100 - e - d + '%' },
    { left: e + '%', top: o + '%' },
  ];
  return (
    <div
      style={{ width: size, height: size, borderRadius: radius, background: tile, position: 'relative', flex: 'none' }}
      role="img"
      aria-label="TeamOps"
      {...rest}
    >
      {pos.map((p, i) => (
        <span key={i} style={{ position: 'absolute', ...p, width: d + '%', height: d + '%', borderRadius: '50%', background: dot }} />
      ))}
    </div>
  );
}

export function TeamOpsLogo({ size = 40, reverse = false, stacked = false }) {
  return (
    <div style={{ display: 'flex', flexDirection: stacked ? 'column' : 'row', alignItems: 'center', gap: size * 0.28 }}>
      <TeamOpsMark size={size} tile={reverse ? '#65c86b' : '#0c140c'} dot={reverse ? '#0c140c' : '#65c86b'} />
      <span
        style={{
          fontFamily: "'Instrument Sans', 'Helvetica Neue', Arial, sans-serif",
          fontWeight: 600,
          fontSize: size * 0.58,
          letterSpacing: '-0.04em',
          lineHeight: 1,
          color: reverse ? '#fff' : '#0c140c',
        }}
      >
        Team<span style={{ color: reverse ? '#65c86b' : '#38853e' }}>Ops</span>
      </span>
    </div>
  );
}
