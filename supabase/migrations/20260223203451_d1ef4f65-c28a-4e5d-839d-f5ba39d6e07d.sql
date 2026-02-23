UPDATE cdn_scripts
SET content = replace(
  content,
  E'{\n            name: "Trocar Instância",',
  E'{\n            name: "Perfil",\n            icon: "👤",\n            commands: [\n                { cmd: "#nome_perfil", desc: "Alterar nome do perfil", fields: [\n                    { name: "nome", placeholder: "Minha Empresa - Atendimento", required: true }\n                ], sep: " " },\n                { cmd: "#foto_perfil", desc: "Alterar foto do perfil", fields: [\n                    { name: "url", placeholder: "URL da imagem (640x640)", required: true }\n                ], sep: " " },\n            ]\n        },\n        {\n            name: "Trocar Instância",'
),
updated_at = now()
WHERE slug = 'bridge-button-v1.js' AND is_active = true;