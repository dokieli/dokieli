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

export default function MockGrapoi(triples = []) {
    this.triples = triples;
    this.currentSubject = triples[0]?.subject;  // Safeguard in case of empty triples
  }
  
  MockGrapoi.prototype.node = function (subject) {
    this.currentSubject = subject;
    return this;
  };
  
  MockGrapoi.prototype.out = function (predicate) {
    if (!this.currentSubject) {
      throw new Error("No subject selected. Use `.node(subject)` first.");
    }
  
    const subjectValue = typeof this.currentSubject === "string" ? this.currentSubject : this.currentSubject.value;
    const predicateValue = predicate?.value ?? predicate;
  
    const results = this.triples
      .filter(triple => triple.subject.value === subjectValue && (!predicate || triple.predicate.value === predicateValue))
      .map(triple => triple.object.value);
  
    return {
      values: results,
      quads: () =>
        this.triples
          .filter(triple => triple.subject.value === subjectValue && (!predicate || triple.predicate.value === predicateValue))
          .map(triple => ({
            subject: { value: triple.subject.value },
            predicate: { value: triple.predicate.value },
            object: { value: triple.object.value },
          })),
      distinct: () => ({ values: [...new Set(results)] }),
    };
  };
  
  
  MockGrapoi.prototype.add = function (subject, predicate, object) {
    this.triples.push({ subject, predicate, object });
    return this;
  };
  
  MockGrapoi.prototype.debug = function () {
    return JSON.stringify(this.triples, null, 2);
  };
  