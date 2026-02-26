UPDATE cdn_scripts SET content = replace(content,
  $search$: '')' +$search$,
  $repl$: '') +$repl$),
updated_at = now()
WHERE id = 'ec7a8c6f-62f5-4097-a288-690cb3f3d1b1';