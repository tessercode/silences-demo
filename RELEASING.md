# Going public

The demo goes public together with the *Playing the Silences* release (tessercode/silences), because
the page serves the release's code and models (`public/silences_bundle.tar`). Do these in order.

## Before release day (done)

- CI (`.github/workflows/ci.yml`) runs on every push:
  - the bridge tests;
  - the build;
  - the 100-case parity in Pyodide under Node, then in Chromium, Firefox and WebKit;
  - the clip and overflow check in all three browsers.
- The Pages deploy job is skipped while this repository is private.
- The footer's citations live in `src/about.ts`, with nulls where the DOIs go.
- `public/THIRD_PARTY_NOTICES.txt` is served with the site.
- The explanatory text is collected for review in `docs/copy.md`.

While tessercode/silences is private, CI fetches it with a read-only deploy key. Set it up once:

```bash
ssh-keygen -t ed25519 -N "" -C "silences-demo CI (read-only)" -f /tmp/silences_ci
gh repo deploy-key add /tmp/silences_ci.pub -R tessercode/silences --title "silences-demo CI (read-only; remove once public)"
gh secret set SILENCES_DEPLOY_KEY -R tessercode/silences-demo < /tmp/silences_ci
shred -u /tmp/silences_ci && rm /tmp/silences_ci.pub
```

## Release day

1. **Make the silences release public, tag it, and let Zenodo archive it.** The tag is what the paper
   and the demo cite.
2. **Pin the demo to that tag:**
   ```bash
   git -C vendor/silences fetch --tags && git -C vendor/silences checkout <tag>
   git add vendor/silences
   ```
   If the release changed anything the bridge relies on, regenerate the parity expectations with
   `python tools/parity_cases.py` and look at what moved before committing.
3. **Fill the DOIs in `src/about.ts`:**
   - `release.doi`, the Zenodo DOI (the version DOI, so it names this exact release);
   - `paper.venue`, and `paper.doi` once there is one.
4. **Run the checks locally:**
   ```bash
   python -m pytest -q tests
   npm run build
   npx vite preview --port 8091 &
   node tools/browser_parity.mjs http://localhost:8091/
   node tools/clip_check.mjs http://localhost:8091/
   ```
   Then commit and push, and wait for CI to go green.
5. **Make this repository public** (Settings → General → Danger zone).
6. **Turn on Pages** (Settings → Pages → Source: GitHub Actions). Re-run the latest CI run, or push,
   and the deploy job publishes `dist/` to `https://tessercode.github.io/silences-demo/`.
7. **Remove the deploy key and the secret:**
   ```bash
   gh repo deploy-key list -R tessercode/silences      # note the key's id
   gh repo deploy-key delete <id> -R tessercode/silences
   gh secret delete SILENCES_DEPLOY_KEY -R tessercode/silences-demo
   ```
   Re-run CI to confirm that the plain HTTPS fetch works.
8. **Check the live site:**
   - open it in Chrome, Firefox and Safari, and on a phone over cellular;
   - confirm the first load shows the three load steps and then decodes;
   - confirm the footer shows the DOIs and the pinned tag.
9. **Update the test server on spinnaker:**
   ```bash
   ssh spinnaker 'cd ~/workspace/silences-demo && git pull --ff-only && git submodule update --init && systemctl --user restart silences-demo'
   ```
10. **Link the demo** from the silences README, and from the paper if wanted.
