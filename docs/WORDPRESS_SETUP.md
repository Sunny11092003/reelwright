# WordPress setup

1. WordPress 5.6+ over **https**. Permalinks must not be "Plain" (Settings → Permalinks → Post name) so `/wp-json/` works.
2. Users → Profile → **Application Passwords** → name it, Add, copy the password.
3. Use an **Editor or Administrator** user. Administrator is required for JSON-LD schema output because WordPress strips `<script>` for lesser roles.
4. In the app: Connected accounts → Connect WordPress → site URL, username, application password. The backend verifies via `/wp-json/wp/v2/users/me` and stores credentials encrypted (AES-256-GCM). They are never sent to the browser again.
5. If a security plugin or host blocks the REST API or the `Authorization` header you will see 401/403. Allow it, or add to `.htaccess`: `RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]`.

## What is published
Title (H1), slug, excerpt, article HTML (optional embedded video, FAQ section, JSON-LD), categories and tags (created if missing), featured image (a frame from the video), status `publish` or `draft`.

## SEO plugin fields
Settings → Publishing: choose Yoast or Rank Math to also send SEO title, meta description and focus keyword. Those meta keys are not exposed over REST by default; add this mu-plugin or functions.php snippet:
```php
add_action('init', function () {
  foreach (['_yoast_wpseo_title','_yoast_wpseo_metadesc','_yoast_wpseo_focuskw','rank_math_title','rank_math_description','rank_math_focus_keyword'] as $k) {
    register_post_meta('post', $k, ['show_in_rest' => true, 'single' => true, 'type' => 'string',
      'auth_callback' => function () { return current_user_can('edit_posts'); }]);
  }
});
```
Without it WordPress ignores those fields; publishing still succeeds.

## Local development
Set `ALLOW_PRIVATE_WORDPRESS_HOSTS=true` to allow `localhost`/private IPs (blocked by default as SSRF protection).

## Not supported
WordPress.com free plans (no REST write access) and sites requiring OAuth instead of Application Passwords.
