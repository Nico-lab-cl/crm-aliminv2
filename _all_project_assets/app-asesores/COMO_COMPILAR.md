# Cómo compilar el APK v2.0

App de asesores de Alimin. Es un WebView que carga `https://crm.aliminlomasdelmar.com/`.

---

## Qué cambió respecto a la v1.1 (versionCode 2)

| Cambio | Por qué era necesario |
|---|---|
| `onShowFileChooser` en el `WebChromeClient` | Sin esto, tocar el clip de adjuntar **no hacía absolutamente nada**. El WebView le pregunta a la app qué hacer con un `<input type="file">`; la v1.1 usaba el `WebChromeClient()` de fábrica, que no responde. |
| `onPermissionRequest` + permiso `RECORD_AUDIO` | Sin esto, `getUserMedia` se rechaza y el botón de micrófono no puede grabar. El WebView tiene su propio sistema de permisos, separado del de Android: hay que conceder en los dos. |
| `FileProvider` + `res/xml/file_paths.xml` | Para poder ofrecer la cámara en el selector. Desde Android 7 no se le puede pasar una ruta directa a otra app. |
| Tres canales de notificación en vez de uno | Un lead nuevo, un mensaje de un cliente y un recordatorio de seguimiento ahora suenan distinto y se pueden silenciar por separado. |
| `versionCode` 2 → **3** | Android se niega a instalar encima una versión igual o menor. Sin subirlo, el asesor ve *"aplicación no instalada"* sin más explicación. |

**No se agregó el permiso `CAMERA`** a propósito. Las fotos y videos se toman delegando en la app de cámara del teléfono, que no requiere ese permiso. Declararlo obligaría a pedirlo en tiempo de ejecución sin necesitarlo, y es un permiso que asusta al instalar.

---

## Antes de compilar: la firma

Esto es lo único que puede salir mal de forma difícil de arreglar, así que va primero.

Android solo deja instalar una actualización encima de la app anterior **si las dos están firmadas con la misma llave**. Si la firma no coincide, el asesor tiene que desinstalar la app vieja (y pierde su sesión) antes de instalar la nueva.

El proyecto no tiene ningún `signingConfig` ni archivo `.jks` guardado, así que la v1.1 casi con seguridad se compiló como **debug**, firmada con la llave de depuración de tu propio Android Studio (`~/.android/debug.keystore`).

Si es así, la buena noticia es que **no tienes que hacer nada**: mientras compiles el APK en el mismo computador y con el mismo usuario de Windows, la llave es la misma y la actualización se instala encima sin problema.

Verifícalo antes de repartir nada:

```bash
keytool -printcert -jarfile app-debug.apk
```

Compara el SHA-256 del APK nuevo con el del APK que hoy tienen instalado los asesores. Si coinciden, la actualización entra limpia. Si no coinciden, hay que desinstalar e instalar de nuevo.

---

## Compilar desde Android Studio

1. Abre la carpeta `app-asesores` como proyecto.
2. **File → Sync Project with Gradle Files**. Hay dependencias nuevas que resolver.
3. **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
4. El archivo queda en `app/build/outputs/apk/debug/app-debug.apk`.

Repártelo por WhatsApp o Drive. Cada asesor lo abre y toca instalar; Android va a pedir permiso para instalar desde esa app la primera vez.

---

## Compilar por línea de comandos

No hay `gradlew` en el proyecto (falta el `gradle-wrapper.jar`), así que hay que usar un Gradle instalado. Con el que Android Studio ya dejó en caché:

```bash
JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ANDROID_HOME="$HOME/AppData/Local/Android/Sdk" "$HOME/.gradle/wrapper/dists/gradle-8.5-bin/5t9huq95ubn472n8rpzujfbqh/gradle-8.5/bin/gradle" assembleDebug
```

Si falla con `PKIX path building failed` al descargar dependencias, es el antivirus o el proxy de la red interceptando TLS. Compila desde Android Studio, que usa su propio almacén de certificados y sí funciona.

---

## Qué probar después de instalar

En orden, porque cada paso depende del anterior:

1. **Entrar y ver la bandeja.** Si la app no carga el CRM, nada de lo demás importa.
2. **Abrir una conversación del chat web** (ícono de globo verde). El clip y el micrófono solo aparecen ahí: en Messenger e Instagram no se muestran porque enviar adjuntos por Meta requiere subir el archivo a su API, que no está construido.
3. **Tocar el clip.** Debe abrirse el selector con la galería *y* la cámara. Si no pasa nada al tocarlo, el APK instalado sigue siendo el viejo.
4. **Tocar el micrófono.** La primera vez Android pide permiso de grabación. Concederlo, grabar tres segundos, tocar el cuadrado para enviar.
5. **Verificar que llegó** abriendo el chat en `aliminspa.cl` desde otro dispositivo.
6. **Revisar la ficha de un lead.** Debe aparecer la tarjeta *"Pendiente de contactar"* con su interruptor.
7. **Confirmar que suena distinto.** Ajustes → Notificaciones de la app: deben verse tres categorías, no una.

---

## Si el micrófono no funciona en un teléfono puntual

El error que muestra el CRM (*"no se pudo usar el micrófono"*) casi siempre significa que el asesor rechazó el permiso la primera vez. Android no lo vuelve a preguntar.

Se arregla en **Ajustes → Aplicaciones → CRM Alimin → Permisos → Micrófono → Permitir**.

Ojo aparte con Honor, Xiaomi y algunos Oppo: matan las apps en segundo plano de forma agresiva. Eso no afecta la grabación, pero sí a las notificaciones push, que es un problema distinto y ya conocido en este proyecto.
