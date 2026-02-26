UPDATE cdn_scripts SET content = replace(replace(content,
  $s1$var bg = idx % 2 === 0 ? '#ffffff' : '#f9fafb'$s1$,
  $r1$var bg = idx % 2 === 0 ? '#1e1e2e' : '#16162a'$r1$),
  $s2$el.style.background=\'#d1fae5\'$s2$,
  $r2$el.style.background=\'#1a3a2a\'$r2$),
updated_at = now()
WHERE id = 'ec7a8c6f-62f5-4097-a288-690cb3f3d1b1';