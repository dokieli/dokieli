/*!
Copyright 2012-2026 Sarven Capadisli <https://csarven.ca/>
Copyright 2023-2026 Virginia Balseiro <https://virginiabalseiro.com/>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

const SECTIONS = [
  { type: 'summary', label: 'Summary' },
  { type: 'experience', label: 'Experience' },
  { type: 'education', label: 'Education' },
  { type: 'skills', label: 'Skills' },
  { type: 'presentations', label: 'Presentations and Talks' },
  { type: 'contributions', label: 'Technical and Community Contributions' },
  { type: 'scholarly-articles', label: 'Scholarly Articles' }
  { type: 'awards', label: 'Awards' }
];

const DEFAULT_SECTIONS = [
  'summary',
  'experience',
  'education',
  'skills'
];

const SKILLS_TYPES = [
  { type: 'programming-languages', label: 'Programming Languages' },
  { type: 'human-languages', label: 'Human Languages' },
];

// Build interactive TOC from SECTIONS and SKILLS_TYPES

export function buildTOC(cv) {
    // if on edit mode, show sections as buttons to add sections (existing sections should have a minus button to delete section)
    
    // if on view mode, show sections as links to scroll to sections 
}

export function addExperienceSection(cv, experience) {}

export function addEducationSection(cv, education) {}

export function addSkillsSection(cv, skills) {}

export function addPresentationsSection(cv, presentations) {}

export function addContributionsSection(cv, contributions) {}

export function addArticlesSection(cv, articles) {}

export function addSkillSubsection(skills, skillType, skillList) {}

export function addExperienceEntry(experience, entry) {}

export function addEducationEntry(education, entry) {}

export function addPresentationEntry(presentations, entry) {}

export function addContributionEntry(contributions, entry) {}

export function addArticleEntry(articles, entry) {}

export function addSkillEntry(skillList, entry) {}

export function createCV() {}

export function deleteEntry(entry) {}

export function editEntry(entry, newData) {}

export function deleteSection(section) {}

export function deleteSubsection(subsection) {}