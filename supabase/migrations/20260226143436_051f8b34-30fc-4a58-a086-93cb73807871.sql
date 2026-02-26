
-- Update the renderMembersTab function to only extract groupjid on button click
UPDATE cdn_scripts
SET content = REPLACE(
  REPLACE(
    REPLACE(
      REPLACE(content,
        'var groupjid = extractGroupJid();
        var locationId = extractLocationId();

        if (!groupjid) {
            var warn = document.createElement(''div'');',
        'var loadBtn = document.createElement(''button'');'
      ),
      'dummy_no_match_1', 'dummy_no_match_1'
    ),
    'dummy_no_match_2', 'dummy_no_match_2'
  ),
  'dummy_no_match_3', 'dummy_no_match_3'
),
updated_at = now()
WHERE slug = 'bridge-button-beta.js';
