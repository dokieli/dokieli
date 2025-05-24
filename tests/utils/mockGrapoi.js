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
  