
UPDATE cdn_scripts
SET content = replace(
  replace(
    replace(
      replace(content,
        '<label>corpo *</label><input type="text" placeholder="Texto do card" data-cr-body />',
        '<label>descrição</label><input type="text" placeholder="Descrição do card (opcional)" data-cr-body />'
      ),
      'if (!c.body) { var b = cardEl.querySelector(''[data-cr-body]''); if (b) b.style.borderColor = ''#ef4444''; valid = false; }',
      '/* body is optional */'
    ),
    'cardParts.push(''['' + c.title + ''],'' + c.image + '','' + c.body + '','' + btns.join('',''));',
    'cardParts.push(''['' + c.title + ''],'' + c.image + (c.body ? '','' + c.body : '''') + '','' + btns.join('',''));'
  ),
  'v1.1.0',
  'v1.1.1'
),
updated_at = now()
WHERE id = 'a0fe7cb1-ac9d-420e-9b6c-51a34257b752';
