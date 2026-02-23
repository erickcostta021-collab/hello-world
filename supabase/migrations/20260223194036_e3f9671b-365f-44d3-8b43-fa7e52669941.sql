
UPDATE cdn_scripts
SET content = replace(
  replace(
    replace(
      replace(
        replace(content,
          -- Update saveCardState to save button objects
          E'                var btnInputs = cardEls[c].querySelectorAll(\'[data-btn-idx]\');\n                for (var b = 0; b < btnInputs.length; b++) {\n                    var bi = parseInt(btnInputs[b].getAttribute(\'data-btn-idx\'));\n                    state.cards[ci].buttons[bi] = btnInputs[b].value;\n                }',
          E'                var btnInputs = cardEls[c].querySelectorAll(\'[data-btn-idx]\');\n                for (var b = 0; b < btnInputs.length; b++) {\n                    var bi = parseInt(btnInputs[b].getAttribute(\'data-btn-idx\'));\n                    var typeEl = cardEls[c].querySelector(\'[data-btn-type="\' + ci + \'-\' + bi + \'"]\');\n                    var valEl = cardEls[c].querySelector(\'[data-btn-val="\' + bi + \'"]\');\n                    state.cards[ci].buttons[bi] = { type: typeEl ? typeEl.value : \'reply\', label: btnInputs[b].value, value: valEl ? valEl.value : \'\' };\n                }'
        ),
        -- Update addButton to push object
        E'state.cards[cardIdx].buttons.push(\'\');',
        E'state.cards[cardIdx].buttons.push({ type: \'reply\', label: \'\', value: \'\' });'
      ),
      -- Update initial card state
      E'buttons: [\'\']',
      E'buttons: [{ type: \'reply\', label: \'\', value: \'\' }]'
    ),
    -- Update buildCarouselCmd button filter and format
    E'var btns = c.buttons.filter(function(b) { return b && b.trim(); });',
    E'var btns = c.buttons.filter(function(b) { return b && b.label && b.label.trim(); }).map(function(b) { if (b.type === \'url\') return b.label + \'|\' + (b.value || \'\'); if (b.type === \'copy\') return b.label + \'|copy:\' + (b.value || \'\'); if (b.type === \'call\') return b.label + \'|call:\' + (b.value || \'\'); return b.label; });'
  ),
  -- Update button validation
  E'if (!c.buttons[0]) {',
  E'if (!c.buttons[0] || !c.buttons[0].label) {'
),
updated_at = now()
WHERE id = 'a0fe7cb1-ac9d-420e-9b6c-51a34257b752';
