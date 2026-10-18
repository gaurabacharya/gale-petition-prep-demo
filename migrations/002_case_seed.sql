-- Demo-only seeded values: the extraction design has no source for these.
alter table cases add column case_type text not null default 'lottery';
alter table cases add column employer_questionnaire text not null default 'Approved';
alter table cases add column beneficiary_questionnaire text not null default 'Pending';
