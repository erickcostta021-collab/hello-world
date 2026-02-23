
UPDATE cdn_scripts
SET content = replace(
  content,
  E'            // Wire card-level events via delegation\n            cardsDiv.onclick = function(e) {',
  E'            // Wire select change for button types\n            cardsDiv.addEventListener(\'change\', function(e) {\n                var target = e.target;\n                if (target.hasAttribute(\'data-btn-type\')) {\n                    var parts = target.getAttribute(\'data-btn-type\').split(\'-\');\n                    var ci2 = parseInt(parts[0]);\n                    var bi2 = parseInt(parts[1]);\n                    var cardEl2 = cardsDiv.querySelector(\'[data-card-idx="\' + ci2 + \'"]\');\n                    var valInput2 = cardEl2.querySelector(\'[data-btn-val="\' + bi2 + \'"]\');\n                    if (target.value === \'reply\') { valInput2.style.display = \'none\'; valInput2.value = \'\'; }\n                    else { valInput2.style.display = \'\'; }\n                    if (target.value === \'url\') valInput2.placeholder = \'https://exemplo.com\';\n                    else if (target.value === \'copy\') valInput2.placeholder = \'Código ou texto para copiar\';\n                    else if (target.value === \'call\') valInput2.placeholder = \'+5511988888888\';\n                }\n            });\n\n            // Wire card-level events via delegation\n            cardsDiv.onclick = function(e) {'
),
updated_at = now()
WHERE id = 'a0fe7cb1-ac9d-420e-9b6c-51a34257b752';
