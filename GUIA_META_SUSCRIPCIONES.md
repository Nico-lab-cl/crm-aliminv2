# Guía: Configuración de suscripciones en Meta

Para que los mensajes de **Instagram** y los **comentarios** lleguen al CRM, no basta solo con el código. Debes activar las "Suscripciones" en tu Panel de Desarrollador de Meta.

## 1. Configurar Webhooks (Páginas)
1. Ve a tu aplicación en [developers.facebook.com](https://developers.facebook.com/).
2. En el menú de la izquierda, busca **Webhooks**.
3. En el desplegable de arriba (donde dice `User`), cámbialo a **Page**.
4. Haz clic en **Subscribe to this field** (o Manage) para los siguientes campos:
   - `messages` (Para mensajes de Messenger) - *Ya debería estar listo*
   - `feed` (Para los COMENTARIOS de tus publicaciones) - **¡IMPORTANTE!**

## 2. Configurar Webhooks (Instagram)
1. En la misma pantalla de Webhooks.
2. Cambia el desplegable de arriba de `Page` a **Instagram**.
3. Haz clic en **Subscribe to this field** para:
   - `messages` (Para los DMs de Instagram)
   - `comments` (Para los comentarios en tus posts de Instagram)

## 3. Suscribir tu página al Webhook
1. Ve a la sección **Messenger** -> **Ajustes** (o Settings).
2. Asegúrate de que la página de Alimin esté "Suscrita" al Webhook y que tenga los campos marcados.

---

> [!TIP]
> Si no ves la pestaña de **Instagram** en Webhooks, asegúrate de que tu cuenta de Instagram esté vinculada profesionalmente a la página de Facebook en los ajustes de la página.
