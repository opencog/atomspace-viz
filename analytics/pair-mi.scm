;
; pair-mi.scm -- Pipeline that counts pairs and computes MI statistics
;
; This file defines Atomese pipelines that:
; 1. Count pairs from a dynamically-set Meet pattern
; 2. Compute probabilities and entropy for MI calculation
;
; The web UI sets up:
;   - "pair generator": DontExec(Meet) for generating pairs
;
; Counts are stored directly on the atoms being counted (like flow-futures.scm):
;   - Total: on (List (Any "left wildcard") (Any "right wildcard"))
;   - Left marginal for X: on (List X (Any "right wildcard"))
;   - Right marginal for Y: on (List (Any "left wildcard") Y)
;   - Pair (X,Y): on (List X Y)
;
; After counting, probabilities and entropy are computed:
;   - p = count / total
;   - entropy = -log2(p)
;   - Stored as (FloatValue count probability entropy) with key (Any "stats")
;
(use-modules (opencog))

; ---------------------------------------------------------------
; Single-pass counting pipeline.
; For each pair, True executes all 4 IncrementValues.
; The Meet runs ONCE and all counts are updated in a single pass.
(PipeLink (Name "pair-counter")
	(True
		(Filter
			(Rule (VariableList (Variable "left") (Variable "right"))
				(LinkSignature (Type 'LinkValue) (Variable "left") (Variable "right"))
				(True
					; Total count
					(IncrementValue (List (Any "left wildcard") (Any "right wildcard")) (Any "count") (Number 1))
					; Left marginal: X with any right
					(IncrementValue (List (Variable "left") (Any "right wildcard")) (Any "count") (Number 1))
					; Right marginal: any left with Y
					(IncrementValue (List (Any "left wildcard") (Variable "right")) (Any "count") (Number 1))
					; Pair count
					(IncrementValue (List (Variable "left") (Variable "right")) (Any "count") (Number 1))))
			(ValueOf (Anchor "analytics") (Predicate "pair generator")))))

; Fetch the total count
(PipeLink (Name "get total count")
	(ValueOf (List (Any "left wildcard") (Any "right wildcard")) (Any "count")))

; ---------------------------------------------------------------
