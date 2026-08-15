import { baseMetadata, extractAccountName } from "./base.js";
import {
  parseCaseFinal,
  parseCaseOpen,
  parseCaseUpdate,
  parsePaymentReview,
  parseRefundRequested,
  parseResponseOnCase,
} from "./caseEmails.js";
import {
  parseInvoicePaid,
  parseInvoiceSent,
  parseInvoiceUpdate,
} from "./invoiceEmails.js";
import { parseTransferRequest } from "./transfer.js";

const PARSERS = {
  case_final: parseCaseFinal,
  case_open: parseCaseOpen,
  case_update: parseCaseUpdate,
  payment_review: parsePaymentReview,
  refund_requested: parseRefundRequested,
  response_on_case: parseResponseOnCase,
  invoice_sent: parseInvoiceSent,
  invoice_paid: parseInvoicePaid,
  invoice_update: parseInvoiceUpdate,
  transfer_request: parseTransferRequest,
};

export function parseEmail(
  emailType,
  body,
  { gmailMessageId = "", emailDate = "", subject = "" } = {}
) {
  const meta = baseMetadata({
    gmailMessageId,
    emailDate,
    subject,
    accountName: extractAccountName(body),
    emailType,
  });

  const parser = PARSERS[emailType];
  if (!parser) return meta;
  return parser(body, meta);
}
