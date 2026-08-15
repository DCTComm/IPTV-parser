const RULES = [
  {
    emailType: "transfer_request",
    subjectPatterns: ["transfer request is processing"],
    bodyPatterns: ["we're transferring money to your bank"],
  },
  {
    emailType: "invoice_paid",
    subjectPatterns: ["paid for your invoice"],
    bodyPatterns: ["you received a", "payment", "for your invoice"],
    bodyAll: false,
  },
  {
    emailType: "invoice_update",
    subjectPatterns: ["updated your invoice"],
    bodyPatterns: ["your updated invoice is"],
  },
  {
    emailType: "invoice_sent",
    subjectPatterns: ["we sent your invoice"],
    bodyPatterns: ["your invoice is on the", "way"],
    bodyAll: false,
  },
  {
    emailType: "case_open",
    subjectPatterns: ["action required for case id", "reminder: action required"],
    bodyPatterns: ["please provide any additional information"],
  },
  {
    emailType: "case_update",
    subjectPatterns: ["update on case id"],
    bodyPatterns: ["an update on your case"],
  },
  {
    emailType: "case_final",
    subjectPatterns: ["decided the case"],
    bodyPatterns: ["we've decided the case", "in your favor"],
  },
  {
    emailType: "payment_review",
    subjectPatterns: ["reviewing a payment you"],
    bodyPatterns: ["we're reviewing a payment you received"],
  },
  {
    emailType: "refund_requested",
    subjectPatterns: ["your buyer has filed a case"],
    bodyPatterns: ["your buyer has filed a chargeback", "you have received a case"],
    bodyAll: false,
  },
  {
    emailType: "response_on_case",
    subjectPatterns: ["your paypal case"],
    bodyPatterns: ["thank you for your response"],
  },
];

const BODY_FALLBACKS = [
  { emailType: "case_final", bodyPatterns: ["we've decided the case", "in your favor"] },
  { emailType: "case_open", bodyPatterns: ["please provide any additional information"] },
  { emailType: "case_update", bodyPatterns: ["an update on your case"] },
  { emailType: "invoice_paid", bodyPatterns: ["amount paid", "invoice #"] },
  { emailType: "invoice_update", bodyPatterns: ["amount due:", "updated invoice"] },
  { emailType: "invoice_sent", bodyPatterns: ["we sent your invoice to"] },
  { emailType: "payment_review", bodyPatterns: ["we're reviewing a payment you received"] },
  { emailType: "refund_requested", bodyPatterns: ["your buyer has filed a chargeback"] },
  { emailType: "response_on_case", bodyPatterns: ["thank you for your response"] },
  { emailType: "transfer_request", bodyPatterns: ["we're transferring money to your bank"] },
];

function collapseForMatch(text) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function matches(text, patterns, matchAll) {
  if (!patterns?.length) return false;
  const lowered = collapseForMatch(text);
  if (matchAll) return patterns.every((p) => lowered.includes(p));
  return patterns.some((p) => lowered.includes(p));
}

export function classifyEmail(subject, body) {
  const bodyL = collapseForMatch(body);
  const combined = `${collapseForMatch(subject)} ${bodyL}`;

  for (const rule of RULES) {
    const subjectOk =
      !rule.subjectPatterns?.length ||
      matches(combined, rule.subjectPatterns, false);
    const bodyOk =
      !rule.bodyPatterns?.length ||
      matches(bodyL, rule.bodyPatterns, rule.bodyAll !== false);
    if (subjectOk && bodyOk && (rule.subjectPatterns?.length || rule.bodyPatterns?.length)) {
      return rule.emailType;
    }
  }

  for (const rule of BODY_FALLBACKS) {
    if (matches(bodyL, rule.bodyPatterns, rule.bodyAll !== false)) {
      return rule.emailType;
    }
  }

  return "unknown";
}
