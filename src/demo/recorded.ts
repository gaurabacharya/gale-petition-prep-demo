// Model responses for the John Doe demo documents, written once by Claude (claude-sonnet-5-5) and replayed
// by the `replay` provider. Quotes are exact text from src/demo/sampleDocs.ts.
const x = (value: string, quote = value) => ({ value, quote });

export const RECORDED_DEGREE = {
  name: x("John Doe"),
  degree: x("Bachelor of Science", "Bachelor of Science in Computer Science"),
  field_of_study: x("Computer Science", "Bachelor of Science in Computer Science"),
  institution: x("Utopia University", "UTOPIA UNIVERSITY"),
  date_conferred: x("May 20, 2012", "Conferred on May 20, 2012"),
};

export const RECORDED_OFFER_LETTER = {
  name: x("John Doe", "Dear John Doe"),
  job_title: x("Software Engineer", "the position of Software Engineer"),
  duties: x("designing and building backend services"),
  annual_salary: x("$95,000", "Your annual salary will be $95,000"),
  start_date: x("October 1, 2026", "Your start date will be October 1, 2026"),
  employer: x("Utopia Technologies Inc."),
  worksite_location: x("100 Main Street, Springfield", "Your worksite will be 100 Main Street, Springfield"),
};

export const RECORDED_LETTER = `[DATE]

[USCIS SERVICE CENTER]
[SERVICE CENTER ADDRESS]

Re: Form I-129, Petition for a Nonimmigrant Worker (H-1B)
Beneficiary: John Doe
Petitioner: Utopia Technologies Inc.
Position: Software Engineer

Dear Officer:

Utopia Technologies Inc. submits this letter in support of its petition to employ John Doe as a Software Engineer in H-1B status beginning October 1, 2026. The position is a specialty occupation, and Mr. Doe holds the degree that the position requires.

The position. Utopia Technologies Inc. is hiring a Software Engineer to work at 100 Main Street, Springfield, at an annual salary of $95,000. The duties are designing and building backend services. [DETAILED DUTIES AND PERCENTAGE OF TIME ON EACH]

Why the position is a specialty occupation. Designing and building backend services requires theoretical and practical knowledge of how software systems are specified, structured, built and maintained. That knowledge is taught in a bachelor's program in computer science, and the work cannot be done competently without it. A bachelor's degree in computer science or a closely related field is therefore the normal minimum requirement for the position. [EVIDENCE OF INDUSTRY STANDARD, SUCH AS OCCUPATIONAL HANDBOOK CITATION OR COMPARABLE EMPLOYER POSTINGS]

The beneficiary's qualifications. Mr. Doe holds a Bachelor of Science in Computer Science from Utopia University, conferred on May 20, 2012. His field of study is the very field in which the duties of the position fall, so the degree relates directly to the work. Courses in computer science give the foundation for the design and construction of backend services. [RELEVANT COURSEWORK AND WORK EXPERIENCE, IF ANY]

The offered wage. The petitioner will pay $95,000 per year. [PREVAILING WAGE LEVEL FOR THE OCCUPATION AND AREA, AND LCA CERTIFICATION NUMBER]

Conclusion. The position of Software Engineer requires the application of specialized knowledge in computer science, and Mr. Doe's Bachelor of Science in Computer Science is the degree that knowledge calls for. We respectfully ask that the petition be approved. [ADDITIONAL EXHIBITS TO LIST]

Sincerely,

[SIGNATORY NAME]
[SIGNATORY TITLE]
Utopia Technologies Inc.
`;
