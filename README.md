# Pulso — Entrenamiento RCP de Paramédico

Simulador educativo de ritmo y secuencia para RCP en adultos sin vía aérea avanzada. Interfaz responsive con estadísticas, metrónomo visual, esquema del tórax y guía de práctica.

## Uso

Abre `index.html` en un navegador moderno, sin instalación ni compilación.

1. Pulsa **Iniciar práctica**. La cuenta regresiva dura tres segundos.
2. Pulsa **Registrar compresión** una vez por compresión simulada. También puedes utilizar Espacio con el botón enfocado o fuera de otros controles.
3. Tras 30 pulsaciones, registra dos ventilaciones simuladas. El siguiente ciclo comienza automáticamente, pero las acciones siempre son manuales.
4. **Pausar** conserva el tiempo y los contadores; **Continuar** reanuda la sesión. **Reiniciar** borra la práctica actual.

El metrónomo visual marca 110 pulsos por minuto. El ritmo mostrado utiliza hasta los últimos cinco intervalos entre pulsaciones; se reinicia al pausar o cambiar de fase para excluir esas pausas. Las ventilaciones y los ciclos se acumulan durante toda la sesión.

## Archivos

- `index.html`: estructura, guía, planes Free y Enterprise y contacto comercial.
- `styles.css`: diseño y adaptación a móvil, con fuentes locales del sistema.
- `app.js`: estado de sesión, controles, metrónomo y métricas.

## Alcance

Registra pulsaciones, no mide profundidad, retroceso torácico ni calidad de ventilación. No sustituye la formación práctica supervisada ni constituye una guía de emergencia o certificación.

Referencia: [AHA 2025 — Adult Basic Life Support](https://cpr.heart.org/en/resuscitation-science/cpr-and-ecc-guidelines/adult-basic-life-support).

## Validación

Comprobados en Chromium: cuenta regresiva, ausencia de compresiones automáticas, ciclo 30:2, pausa y continuación, reinicio y ausencia de desbordamiento horizontal a 390, 768 y 1024 píxeles. Revisión visual a 1440 y 390 píxeles.

## Licencia

MIT. Consulta `LICENSE`.

## Planes y privacidad de la demo

Free funciona solo en memoria: no hay cuentas, API, almacenamiento web, historial ni grabación de sesiones. Se retiraron Microsoft Clarity y Google Fonts remotas. El alojamiento puede mantener sus propios registros técnicos, ajenos al historial de prácticas de la aplicación.

Enterprise es una oferta de desarrollo a medida, no una función ya implementada. Los precios públicos son sugeridos y requieren una cotización. El análisis, alcance base y supuestos están en `ANALISIS-MERCADO.md`. Contacto: devlewiso@gmail.com.
