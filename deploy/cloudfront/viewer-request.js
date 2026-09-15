// Viewer-request, default cache behavior only.
//
// Two jobs: the www -> apex redirect, and the SPA fallback.
//
// SPA FALLBACK, AND WHY IT IS HERE RATHER THAN ON THE RESPONSE:
// This used to be done with distribution-wide CustomErrorResponses
// (403/404 -> /index.html as 200). Those applied to EVERY behavior including
// /api/*, so the API could never tell an external caller that an endpoint did
// not exist. Razorpay's webhook was pointed at a retired domain on this
// distribution, got 200 + HTML for every event, marked them all delivered and
// retried nothing -- a month of payment events lost in silence.
//
// The obvious replacement, a viewer-RESPONSE function flipping 404 to 200, does
// not work: "If the origin returns an HTTP error of 400 and above, the
// CloudFront Function will not run." Note that `aws cloudfront test-function`
// does NOT model that restriction, so such a function tests green and never
// fires in production. Rewriting the request before it reaches the origin means
// no error is produced in the first place.
//
// /api/* has its own cache behavior, so this function never sees it and API
// responses keep their real status codes.
var PRERENDERED_PREFIXES = ['/blog', '/privacy-policy', '/terms-of-service'];

function handler(event) {
    var request = event.request;
    var headers = request.headers;
    var host = headers.host && headers.host.value;

    if (host === 'www.vyostra.com') {
        var redirectUri = request.uri;
        var querystring = request.querystring;
        var qs = '';
        var keys = Object.keys(querystring);

        if (keys.length > 0) {
            var parts = [];
            for (var i = 0; i < keys.length; i++) {
                var key = keys[i];
                var qsValue = querystring[key];
                if (qsValue.multiValue) {
                    for (var j = 0; j < qsValue.multiValue.length; j++) {
                        parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(qsValue.multiValue[j].value));
                    }
                } else if (qsValue.value !== undefined) {
                    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(qsValue.value));
                }
            }
            qs = '?' + parts.join('&');
        }

        return {
            statusCode: 301,
            statusDescription: 'Moved Permanently',
            headers: {
                'location': { value: 'https://vyostra.com' + redirectUri + qs }
            }
        };
    }

    var uri = request.uri;

    // The S3 website origin serves '/' and directory indexes itself. '/' is the
    // prerendered homepage (dist/index.html), so it must NOT fall through to
    // the shell rewrite below.
    if (uri === '/' || uri.charAt(uri.length - 1) === '/') {
        return request;
    }

    // Anything with an extension is a real file. Leaving these alone is what
    // makes a missing bundle return a real 404 instead of a page-shaped 200 --
    // the failure mode that hid a broken deploy on 2026-08-22.
    var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);
    if (lastSegment.indexOf('.') !== -1) {
        return request;
    }

    // Prerendered routes are real directories with their own index.html, and
    // rewriting them would serve the empty SPA shell to crawlers instead of the
    // rendered article. Keep this list in step with prerender.mjs's getRoutes().
    for (var p = 0; p < PRERENDERED_PREFIXES.length; p++) {
        var prefix = PRERENDERED_PREFIXES[p];
        if (uri === prefix || uri.indexOf(prefix + '/') === 0) {
            return request;
        }
    }

    // Client-rendered routes get the empty SPA shell. Not /index.html: that is
    // the prerendered homepage, and serving it here would hand /login,
    // /dashboard and /features the homepage's title and canonical, and flash
    // the landing page at app users before the bundle boots. scripts/prerender.mjs
    // writes dist/app-shell.html; it must be in the bucket before this ships.
    request.uri = '/app-shell.html';
    return request;
}
