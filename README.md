# WhatsApp Chat Viewer

A private, browser-only WhatsApp chat viewer for `.txt` and `.zip` exports. Renders chats in an authentic WhatsApp-style UI, everything stays on your device, nothing is uploaded anywhere.

## Features

- **100% client-side** — no server, no uploads, total privacy
- **TXT + ZIP support** — plain text exports or full ZIP with media
- **Inline media** — images, stickers (WebP), videos, audio, and file attachments
- **Message search** — filter by text or username
- **Date jump** — jump directly to a specific date in the chat
- **POV switching** — choose whose perspective to view the chat from
- **Export guide** — step-by-step instructions for Android, iPhone, and Desktop/Web
- **Dark / Light theme** — WhatsApp-accurate colours, saved across sessions
- **Drag-and-drop** — drop a file straight onto the upload zone
- **Responsive** — works on mobile, tablet, and desktop

## Run locally if you don't trust me

```bash
npx serve . -p 5000
```

Then open [http://localhost:5000](http://localhost:5000).

### Otheriwse it's here : WA Chat Viewer


## WhatsApp export formats supported

| Platform | Format |
|---|---|
| Android 12h | `12/31/22, 11:59 PM - User: message` |
| Android 24h | `31/12/2022, 23:59 - User: message` |
| iPhone | `[31/12/2022, 23:59:00] User: message` |

>[!TIP]
>- For chats with photos, videos, or stickers, export the chat **with media** from WhatsApp and upload the `.zip` file.
>- For text-only chats, the `.txt` file is enough.
>- WhatsApp exports via: **Chat > ⋮ / ··· > More > Export chat**