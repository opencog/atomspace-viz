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
; Probability and entropy computation.
; For each counted atom, compute:
;   p = count / total
;   entropy = -log2(p)
; Store as (FloatValue count p entropy) with key (Any "stats")

; Define the total atom for convenience
(define total-atom (List (Any "left wildcard") (Any "right wildcard")))

; Define procedure to compute stats for a pair atom
; Takes left and right, returns (FloatValue count prob entropy)
(DefineLink
	(DefinedProcedure "compute-stats-value")
	(Lambda
		(VariableList (Variable "$L") (Variable "$R"))
		(LinkSignature (Type 'FloatValue)
			(FloatValueOf (List (Variable "$L") (Variable "$R")) (Any "count"))
			(Divide
				(FloatValueOf (List (Variable "$L") (Variable "$R")) (Any "count"))
				(FloatValueOf total-atom (Any "count")))
			(Minus (Number 0)
				(Log2
					(Divide
						(FloatValueOf (List (Variable "$L") (Variable "$R")) (Any "count"))
						(FloatValueOf total-atom (Any "count"))))))))

; Pipeline to compute stats for all pairs
; Uses the cached Meet result to iterate over pairs
(PipeLink (Name "compute-pair-stats")
	(True
		(Filter
			(Rule (VariableList (Variable "left") (Variable "right"))
				(LinkSignature (Type 'LinkValue) (Variable "left") (Variable "right"))
				(SetValue (List (Variable "left") (Variable "right")) (Any "stats")
					(ExecutionOutput (DefinedProcedure "compute-stats-value")
						(List (Variable "left") (Variable "right")))))
			(ValueOf (Anchor "analytics") (Predicate "pair generator")))))

; Pipeline to compute stats for left marginals
; Meet returns individual X atoms (ConceptNodes only); compute stats on (List X wildcard)
(PipeLink (Name "compute-left-stats")
	(True
		(Filter
			(Rule (Variable "$X")
				(Variable "$X")
				(SetValue (List (Variable "$X") (Any "right wildcard")) (Any "stats")
					(ExecutionOutput (DefinedProcedure "compute-stats-value")
						(List (Variable "$X") (Any "right wildcard")))))
			(Meet (TypedVariable (Variable "$X") (Type 'ConceptNode))
				(Present (List (Variable "$X") (Any "right wildcard")))))))

; Pipeline to compute stats for right marginals
; Meet returns individual Y atoms (ConceptNodes only); compute stats on (List wildcard Y)
(PipeLink (Name "compute-right-stats")
	(True
		(Filter
			(Rule (Variable "$Y")
				(Variable "$Y")
				(SetValue (List (Any "left wildcard") (Variable "$Y")) (Any "stats")
					(ExecutionOutput (DefinedProcedure "compute-stats-value")
						(List (Any "left wildcard") (Variable "$Y")))))
			(Meet (TypedVariable (Variable "$Y") (Type 'ConceptNode))
				(Present (List (Any "left wildcard") (Variable "$Y")))))))

; Master pipeline: compute all stats
(PipeLink (Name "compute-all-stats")
	(True
		(Name "compute-pair-stats")
		(Name "compute-left-stats")
		(Name "compute-right-stats")))

; ---------------------------------------------------------------
