/* Чек-лист версии 1 из PDF организаторов. Форма как в CONTRACTS.md, раздел 2. */
window.DA_CHECKLIST = {
  id: "cl_1",
  version: 1,
  name: "Чек-лист качества чатов",
  isActive: true,
  sections: [
    { id: "start", title: "Начало и понимание запроса", order: 1 },
    { id: "safety", title: "Безопасность и решение", order: 2 },
    { id: "flow", title: "Ведение и завершение диалога", order: 3 },
    { id: "gross", title: "Грубые нарушения", order: 4 }
  ],
  criteria: [
    {
      id: "contact", sectionId: "start", order: 1, title: "Установление контакта", type: "binary", weight: 10,
      naAllowed: false, naCondition: null, scale: null, flagTypes: null,
      description: "Да, если оператор поздоровался на языке клиента и представился в первом ответе."
    },
    {
      id: "needs", sectionId: "start", order: 2, title: "Выявление потребности", type: "binary", weight: 15,
      naAllowed: true, naCondition: "Данных для ответа хватало с самого начала.", scale: null, flagTypes: null,
      description: "Да, если оператор учёл известные детали и уточнил недостающее до ответа."
    },
    {
      id: "identification", sectionId: "safety", order: 3, title: "Идентификация", type: "binary", weight: 20,
      naAllowed: true, naCondition: "Запрос не требовал идентификации.", scale: null, flagTypes: null,
      description: "Да, если проверка личности подтверждена до раскрытия данных или защищённого действия. Если проверка требовалась и не подтверждена в чате, ставится «Нет». Общий вопрос о тарифах идентификации не требует."
    },
    {
      id: "consultation", sectionId: "safety", order: 4, title: "Корректная и полная консультация", type: "scale", weight: 20,
      naAllowed: true, naCondition: "Чат закончился до того, как клиент сформулировал запрос.", flagTypes: null,
      description: "Оцените ответ или следующий шаг по шкале. Консультация оценивает, правильно и полно ли решён запрос.",
      scale: [
        { value: 20, description: "Все существенные вопросы закрыты или дан корректный следующий шаг" },
        { value: 15, description: "Основной вопрос решён, пропущена второстепенная деталь" },
        { value: 10, description: "Часть запроса закрыта, существенный вопрос остался открытым" },
        { value: 5, description: "Есть общая подсказка, но клиенту всё ещё непонятно, как действовать" },
        { value: 0, description: "Ответа по существу нет или ключевая рекомендация ошибочна" }
      ]
    },
    {
      id: "empathy", sectionId: "flow", order: 5, title: "Эмпатия и клиентоориентированность", type: "binary", weight: 15,
      naAllowed: false, naCondition: null, scale: null, flagTypes: null,
      description: "Да, если оператор вежлив и, если клиент выразил недовольство или описал неудобство, отреагировал на конкретную проблему."
    },
    {
      id: "dialogue", sectionId: "flow", order: 6, title: "Управление диалогом, скорость и грамотность", type: "scale", weight: 15,
      naAllowed: false, naCondition: null, flagTypes: null,
      description: "Оцените ясность, порядок ответов и предупреждение об ожидании. Порог первой реакции в 3 минуты, теги и вложения в оценку не входят.",
      scale: [
        { value: 10, description: "Ответы ясные и связные. Если было явное ожидание, оператор предупредил" },
        { value: 7, description: "Один заметный сбой, но клиент может понять ответ и продолжить" },
        { value: 4, description: "Клиенту приходится переспрашивать из-за формулировок или порядка ответов" },
        { value: 0, description: "Из-за бессвязных или противоречивых реплик ход диалога непонятен" }
      ]
    },
    {
      id: "closing", sectionId: "flow", order: 7, title: "Завершение", type: "binary", weight: 5,
      naAllowed: true, naCondition: "Чат оборвался до возможности его завершить.", scale: null, flagTypes: null,
      description: "Да, если оператор подвёл итог или предложил дальнейшую помощь и попрощался."
    },
    {
      id: "gross", sectionId: "gross", order: 8, title: "Грубые ошибки", type: "flag", weight: 0,
      naAllowed: false, naCondition: null, scale: null,
      flagTypes: [
        { id: "insult", title: "Оскорбление клиента" },
        { id: "bypass", title: "Платная услуга в обход компании" },
        { id: "confidential", title: "Раскрытие конфиденциальной информации" }
      ],
      description: "Да, если выявлено оскорбление клиента, предложение платной услуги в обход компании или раскрытие конфиденциальной информации."
    }
  ]
};
