UPDATE cdn_scripts 
SET content = REPLACE(
  content,
  E'<span style="font-size:15px;">👤</span>\' +\n                            \'<span style="font-size:13px;color:#111827;">\' + p.phone + \'</span>\' +',
  E'<span style="font-size:15px;">👤</span>\' +\n                            \'<div style="display:flex;flex-direction:column;">\' +\n                                (p.name ? \'<span style="font-size:13px;color:#111827;font-weight:500;">\' + p.name + \'</span>\' : \'\') +\n                                \'<span style="font-size:"\' + (p.name ? \'11\' : \'13\') + \'px;color:\' + (p.name ? \'#6b7280\' : \'#111827\') + \';">\' + p.phone + \'</span>\' +\n                            \'</div>\' +'
),
updated_at = now()
WHERE slug = 'bridge-button-beta.js';