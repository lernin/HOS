# The Lab

Ashley's private workspace for Procedia experiments (Thekonym, Ekpronym, 3D Environment, Roy, Library, ...), a root-level PWA so Android installs it as a standalone application.

The original Hello World proof is preserved on the `baseline/hello-world` branch.

## Water Garden experiment

A landscape-friendly tropical 3D English-learning prototype at `/water-garden`, behind the existing Lab PIN gate. See [implementation, verification, and playtest steps](docs/WATER_GARDEN_HANDOFF.md).

## Waterfall Village experiment

An explorable treehouse village at `/waterfall-village`, behind the existing Lab PIN gate. Walk into furnished homes, climb the great tree, and row to the lake. See the [implementation and phone review handoff](docs/WATERFALL_VILLAGE_HANDOFF.md). Preview review is pending; no production release is claimed.

## Brush

`/brush` is a portrait contest. It uses the normal Lab PIN, then a second Brush PIN. Open it from the hub after the Lab PIN. Deploys stay manual.

### Environment

| Variable | Purpose |
| --- | --- |
| `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` | Full JSON key for a Google service account. Required for sync, upload, image preview, and the vision pass. One line is fine. |
| `BRUSH_DRIVE_FOLDER_ID` | Optional. Defaults to the Beauty Contest folder `1_WEDf6e7FCzUw5nelM1pZypaCBRq0s39`. |
| `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` | Optional overrides. The app already targets Procedia (`jzaghifuhinkzzhiojre`). |
| `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY` | Optional. Stores the small WebP previews in the private `brush-thumbs` bucket. Without it, originals still land in Drive and matchups fall back to the Drive preview. |
| Vercel AI Gateway | Already used by Book Vocab and Ekpronym. Vision auto-tag and recipe phrasing use `openai/gpt-4o-mini` through that gateway. The contest, tags, Elo, and the draft recipe work without it. |

Drive setup:

1. In Google Cloud, enable the Google Drive API.
2. Create a service account and a JSON key.
3. Share the Beauty Contest folder with the service account email as **Editor** (upload needs write access; read-only cannot create `Brush Uploads`).
4. Put the JSON in `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` on the Vercel project. Do not commit the key.

Sync walks that folder and its country subfolders, including files already there and later uploads. Phone uploads keep the full-size original in a `Brush Uploads` subfolder. The phone sends the file in about 3 MB chunks, up to 3 photos at a time, and retries a failed photo. Reopening Brush continues anything still queued on that phone. Each photo is hashed, so the same picture is not added twice. There is no library cap. One selection can include 100 photos; the rest of that selection is left out.

A WebP preview about 1080px tall is cached in the private Supabase Storage bucket `brush-thumbs` so matchups open quickly. Drive stays the source of truth. A new upload starts at 0 games, and the next pairing prefers under-played images, so it enters the contest soon. The pair already on screen stays until that match is decided.

Trash never deletes or moves a Drive file. It sets `trashed_at` on `brush_images`. Trash Review is where those flagged images are tagged later. A full sync archives only database rows whose Drive file was already gone before that sync started. A spare Drive copy of a hashed photo is left where it is and is not added as a second contestant.

### Brush PIN

The Brush PIN is not in source. `brush_access.pin_hash` stores a bcrypt hash. The first person through the Lab PIN chooses 4 to 8 digits in the app, or runs this in the Procedia SQL editor:

```sql
select public.brush_set_pin('YOUR_LAB_PIN', null, 'YOUR_NEW_BRUSH_PIN');
```

Changing it requires the current Brush PIN:

```sql
select public.brush_set_pin('YOUR_LAB_PIN', 'CURRENT_BRUSH_PIN', 'YOUR_NEW_BRUSH_PIN');
```

The app has the same change under Library → Change PIN. If the Brush PIN is forgotten, clear the hash in the Supabase SQL editor (`update public.brush_access set pin_hash = null where id = 1`) and choose a new one. The anon API cannot clear it.

### Tags, Scout, and back-fill

Reason tags are tap-only. A vision pass (`POST /api/brush-vision`) may propose traits that are not in the live list. Scout or an admin can propose one too. Either way it stays `suggested` until Ashley approves it with one tap. Approving offers a vision back-fill that notes the trait on existing images. That pass does not pick winners, trash images, or generate pictures.

Scout or an admin, with both PINs:

```http
POST /api/brush-suggest
x-lab-pin: YOUR_LAB_PIN
x-brush-pin: YOUR_BRUSH_PIN

{"category":"Hair","label":"hair volume","source":"scout"}
```

`source` may be `scout` or `admin`. The same call exists as `select public.brush_suggest_tag(...)`.

Schema and functions live in `supabase/migrations/20261023140000_brush_beauty_contest.sql`, `supabase/migrations/20261023163000_brush_upload_originals.sql`, and `supabase/migrations/20261023164500_brush_register_upload_qualify.sql` on the Procedia project. Tables use the `brush_` prefix, row level security is on, and the browser reaches them only through the PIN-checked functions. The `brush-thumbs` bucket is private. Only the service role writes or reads it, through the upload and preview routes.

Those HTTP routes are one Vercel function, `api/brush.ts`. Rewrites keep `/api/brush-sync`, `/api/brush-upload`, `/api/brush-upload-session`, `/api/brush-upload-chunk`, `/api/brush-upload-finish`, `/api/brush-image`, `/api/brush-thumb`, `/api/brush-vision`, `/api/brush-suggest`, and `/api/brush-recipe` on the same URLs. Code under `api/_brush/` is shared by that function and is not deployed as its own functions.
