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
| Vercel AI Gateway | Already used by Book Vocab and Ekpronym. Vision auto-tag and recipe phrasing use `openai/gpt-4o-mini` through that gateway. The contest, tags, Elo, and the draft recipe work without it. |

Drive setup:

1. In Google Cloud, enable the Google Drive API.
2. Create a service account and a JSON key.
3. Share the Beauty Contest folder with the service account email as **Editor** (upload needs write access; read-only cannot create `Brush Uploads`).
4. Put the JSON in `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` on the Vercel project. Do not commit the key.

Sync walks that folder and its country subfolders, including files already there and later uploads. Uploads from the phone are resized to a long edge of 1600px and stored in a `Brush Uploads` subfolder. Supabase Storage is not used: Drive upload is practical once the service account can write, and resizing keeps each request inside the serverless body limit.

Trash never deletes or moves a Drive file. It sets `trashed_at` on `brush_images`. Trash Review is where those flagged images are tagged later. A full sync archives only database rows whose Drive file was already gone before that sync started.

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

Schema and functions live in `supabase/migrations/20261023140000_brush_beauty_contest.sql` on the Procedia project. Tables use the `brush_` prefix, row level security is on, and the browser reaches them only through the PIN-checked functions.
