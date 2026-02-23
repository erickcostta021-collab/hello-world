UPDATE cdn_scripts
SET content = replace(
  content,
  'cardParts.push(''['' + c.title + ''],'' + c.image + (c.body ? '','' + c.body : '''') + '','' + btns.join('',''));',
  'cardParts.push(''['' + c.title + (c.body ? ''\\n'' + c.body : '''') + ''],'' + c.image + '','' + btns.join('',''));'
),
version = 'v1.1.3',
updated_at = now()
WHERE slug = 'bridge-button-v1.js'