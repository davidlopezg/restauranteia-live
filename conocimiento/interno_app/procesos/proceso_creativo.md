# Proceso Creativo

> Flujo iterativo de 7 fases para crear un plato desde cero.
> El chef trabaja **UNA fase por turno**. Cuando una fase está completa, avanza a la siguiente.
> Documentación complementaria en `conocimiento/fuentes_externas/metodos-creativos.md`.

Este archivo es la **fuente de verdad** del flujo. El orquestador (`agents/creativo/proceso_creativo.py`) lo lee al iniciar y construye la state machine a partir de aquí. Editar este archivo es la forma soportada de modificar el flujo.

---

<!-- fase -->
orden: 1
key: alma
nombre: El alma del plato
descripcion_corta: Qué evoca, qué recuerdo, qué estación, qué producto.
instruccion_llm: |
  Describí el ALMA del plato: qué evoca, qué recuerdo, qué estación, qué producto.
  2-3 frases. Tono poético pero no cursi. Hacés que el lector quiera probar sin haber visto nada.
  Devolvé SOLO el contenido de esta fase, sin encabezado.
<!-- /fase -->

<!-- fase -->
orden: 2
key: metodos
nombre: Métodos creativos que aplico
descripcion_corta: 2-3 métodos creativos específicos (ElBulli + propios) y por qué.
instruccion_llm: |
  Elegí 2-3 métodos creativos ESPECÍFICOS para este plato (de los siguientes:
  lo autóctono, influencias externas, los sentidos como punto de partida,
  el sexto sentido, simbiosis dulce/salado, asociación, inspiración,
  adaptación, deconstrucción, minimalismo, sinergia). NO listes todos — elegí los relevantes.
  Explicá brevemente por qué aplican.
  Devolvé SOLO el contenido de esta fase.
<!-- /fase -->

<!-- fase -->
orden: 3
key: equilibrio
nombre: El equilibrio
descripcion_corta: Análisis dulce/salado/ácido/amargo/umami/graso.
instruccion_llm: |
  Analizá el EQUILIBRIO del plato en términos de: dulce / salado / ácido / amargo / umami / graso.
  Indicá qué vértices del polígono tiene este plato. Cuál es el 'punto crítico' donde se cae si te pasás.
  3-5 frases. Devolvé SOLO el contenido de esta fase.
<!-- /fase -->

<!-- fase -->
orden: 4
key: tecnica
nombre: La técnica
descripcion_corta: Qué procesos potencian el producto sin enmascararlo.
instruccion_llm: |
  Describí la TÉCNICA del plato: qué procesos potencian el producto sin enmascararlo.
  Si hay una técnica 'de autor' que aplica, mencionala.
  Si la técnica obvia es suficiente, decilo (pedantería detectada).
  3-4 frases. Devolvé SOLO el contenido de esta fase.
<!-- /fase -->

<!-- fase -->
orden: 5
key: storytelling
nombre: El storytelling
descripcion_corta: Qué historia va a contar, a quién, por qué.
instruccion_llm: |
  Describí el STORYTELLING del plato: qué historia va a contar.
  A quién va dirigido (público del restaurante).
  Por qué la gente lo va a recordar.
  3-4 frases. Devolvé SOLO el contenido de esta fase.
<!-- /fase -->

<!-- fase -->
orden: 6
key: descartadas
nombre: Cosas que consideré y descarté
descripcion_corta: 2-3 alternativas evaluadas con por qué no.
instruccion_llm: |
  Mencioná 2-3 ALTERNATIVAS que evaluaste pero no elegiste, con una frase explicando por qué cada una.
  Esto muestra tu criterio — el usuario ve que NO es la única opción válida.
  Formato: lista de 'Opción X: razón de descarte'.
  Devolvé SOLO el contenido de esta fase.
<!-- /fase -->

<!-- fase -->
orden: 7
key: preguntas
nombre: Cosas que me preocupan / preguntas al usuario
descripcion_corta: Estacionalidad, accesibilidad, complejidad, riesgos + preguntas.
instruccion_llm: |
  Mencioná cosas que te PREOCUPAN de este plato: estacionalidad, accesibilidad, complejidad técnica, riesgos.
  Si algo está fuera de temporada, mencionalo con propuesta de alternativa.
  Si falta info crítica para decidir (ej: ¿vegetariano estricto?), hacé UNA pregunta concreta al final.
  Si no hay nada que preguntar, decilo.
  Devolvé SOLO el contenido de esta fase.
<!-- /fase -->