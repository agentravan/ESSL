-- Starting letter templates, available to every client. They are ordinary
-- rows: edit them, switch them off, or add your own on the Letter templates page.
-- The agreement template is a starting draft and should be reviewed by a lawyer
-- before it is used.

set search_path = hrms;

insert into letter_templates (name, kind, body) values
('Offer letter', 'offer', $tpl$Ref: {{ref_no}}
Date: {{letter_date}}

{{title}} {{employee_name}}
{{employee_address}}

# Offer of Employment

Dear {{title}} {{employee_name}},

We are pleased to offer you the position of **{{designation}}** with **{{client_legal_name}}**, based at {{location}}. Your date of joining will be **{{date_of_joining}}**.

## Salary

Your gross salary will be Rs. {{gross_monthly}} per month (Rs. {{gross_annual}} per year), made up as follows. Statutory deductions such as provident fund, ESI, professional tax and income tax will apply as the law requires.

{{salary_table}}

## Terms

- You will be on probation for {{probation_months}} months from your date of joining.
- After confirmation, either side may end the employment by giving {{notice_days}} days' notice in writing, or salary in place of notice.
- This offer depends on satisfactory verification of your documents and references.
- A detailed appointment letter will be issued when you join.

This offer is valid until **{{offer_valid_until}}**. Please sign and return a copy of this letter to confirm your acceptance.

We look forward to having you with us.

For {{client_legal_name}}



{{signatory_name}}
{{signatory_designation}}


I accept this offer and will join on the date stated above.

Signature: ____________________     Date: ____________________
Name: {{employee_name}}
$tpl$),
('Appointment letter', 'appointment', $tpl$Ref: {{ref_no}}
Date: {{letter_date}}

{{title}} {{employee_name}}
Employee code: {{employee_code}}
{{employee_address}}

# Letter of Appointment

Dear {{title}} {{employee_name}},

Further to our offer and your acceptance, we confirm your appointment as **{{designation}}** in the {{department}} department of **{{client_legal_name}}** with effect from **{{date_of_joining}}**, on the terms below.

## 1. Place of work

You will be based at {{location}}. The company may ask you to work at any of its other offices or sites as the work requires.

## 2. Salary

Your gross salary is Rs. {{gross_monthly}} per month. The break-up is given below. Salary is paid monthly, after the deductions the law requires.

{{salary_table}}

## 3. Probation and confirmation

You will be on probation for {{probation_months}} months. The company may extend the probation in writing. You will be treated as confirmed only when you receive a letter of confirmation.

## 4. Working hours and leave

Working hours, weekly offs, holidays and leave will follow the company's rules as they apply to your location, and the law that applies to the establishment.

## 5. Notice

During probation, either side may end the employment with 7 days' notice. After confirmation, either side may end it by giving {{notice_days}} days' written notice, or salary in place of notice.

## 6. Conduct and confidentiality

You are expected to follow the company's policies and the reasonable instructions of your manager. You must keep confidential all information about the company's business, customers and employees that you learn through your work, both during your employment and afterwards.

## 7. Company property

Anything the company gives you for your work remains the company's property and must be returned in good condition when you leave.

## 8. Information you have given

This appointment is based on the information and documents you have provided. If any of it is found to be untrue, the company may end the employment.

Please sign the copy of this letter to show that you accept these terms.

For {{client_legal_name}}



{{signatory_name}}
{{signatory_designation}}


I have read and accept the terms above.

Signature: ____________________     Date: ____________________
Name: {{employee_name}}
$tpl$),
('Confidentiality agreement', 'agreement', $tpl$# Confidentiality Agreement

This agreement is made on {{letter_date}} between **{{client_legal_name}}**, having its office at {{client_address}} ("the Company"), and **{{title}} {{employee_name}}**, son/daughter of {{father_name}}, residing at {{employee_address}} ("the Employee").

The Employee is employed by the Company as {{designation}}. In the course of that work the Employee will see information that the Company keeps private. The parties agree as follows.

## 1. Confidential information

"Confidential information" means information about the Company's business that is not public, including customer and supplier details, prices, financial information, business plans, employee information, software, designs and working methods, in any form.

It does not include information that is or becomes public other than through the Employee, or that the Employee is required by law to disclose.

## 2. The Employee's obligations

- To use confidential information only for the Company's work.
- Not to disclose it to anyone outside the Company without written permission.
- To take reasonable care to keep it secure.
- To return or delete all confidential information, and all copies, when the employment ends or when the Company asks.

## 3. Work created in employment

Work that the Employee creates in the course of employment, and the intellectual property rights in it, belong to the Company to the extent the law allows. The Employee will sign any documents reasonably needed to record this.

## 4. Duration

These obligations apply during the employment and continue after it ends for as long as the information remains confidential.

## 5. Governing law

This agreement is governed by the laws of India. The courts at {{jurisdiction}} will have jurisdiction.

Signed by the parties on the date written above.

For {{client_legal_name}}



{{signatory_name}}
{{signatory_designation}}


Employee

Signature: ____________________
Name: {{employee_name}}
$tpl$),
('Experience letter', 'experience', $tpl$Ref: {{ref_no}}
Date: {{letter_date}}

# To Whom It May Concern

This is to certify that **{{title}} {{employee_name}}** (employee code {{employee_code}}) worked with **{{client_legal_name}}** from **{{date_of_joining}}** to **{{exit_date}}**.

At the time of leaving, {{title}} {{employee_name}} held the position of **{{designation}}** in the {{department}} department.

We wish {{title}} {{employee_name}} every success.

For {{client_legal_name}}



{{signatory_name}}
{{signatory_designation}}
$tpl$);
