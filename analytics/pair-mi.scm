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
; Mutual Information computation.
; MI(x,y) = log2(N(x,y) * N(*,*) / (N(x,*) * N(*,y)))

; Define procedure to compute MI for a pair
; Takes left and right, returns MI value
(DefineLink
	(DefinedProcedure "compute-mi-value")
	(Lambda
		(VariableList (Variable "$L") (Variable "$R"))
		(Log2
			(Divide
				(Times
					(FloatValueOf (List (Variable "$L") (Variable "$R")) (Any "count"))
					(FloatValueOf total-atom (Any "count")))
				(Times
					(FloatValueOf (List (Variable "$L") (Any "right wildcard")) (Any "count"))
					(FloatValueOf (List (Any "left wildcard") (Variable "$R")) (Any "count")))))))

; Pipeline to compute MI for all pairs
(PipeLink (Name "compute-mi")
	(True
		(Filter
			(Rule (VariableList (Variable "left") (Variable "right"))
				(LinkSignature (Type 'LinkValue) (Variable "left") (Variable "right"))
				(SetValue (List (Variable "left") (Variable "right")) (Any "mi")
					(ExecutionOutput (DefinedProcedure "compute-mi-value")
						(List (Variable "left") (Variable "right")))))
			(ValueOf (Anchor "analytics") (Predicate "pair generator")))))

; ---------------------------------------------------------------
; Master pipeline: run full MI computation
; Runs pair-counter, compute-all-stats, then compute-mi in sequence
(PipeLink (Name "run-mi")
	(True
		(Name "pair-counter")
		(Name "compute-all-stats")
		(Name "compute-mi")))

; ---------------------------------------------------------------
; MI Histogram: bin-count MI values in Atomese
; 1600 bins of width 0.05, range [-40, +40)
; bin = floor(MI / 0.05) + 800

; Procedure to compute bin index from MI value
; Returns a NumberNode for the bin
(DefineLink
	(DefinedProcedure "compute-mi-bin")
	(Lambda
		(VariableList (Variable "$L") (Variable "$R"))
		(LinkSignature (Type 'NumberNode)
			(Plus (Number 800)
				(Floor
					(Times (Number 20)
						(FloatValueOf (List (Variable "$L") (Variable "$R")) (Any "mi"))))))))

; Pipeline to bin all MI values
; Stores counts on (Anchor "mi-histogram") with key (Number bin-index)
; Bin computation: bin = floor(MI * 20) + 800
(PipeLink (Name "bin-mi")
	(True
		(Filter
			(Rule (VariableList (Variable "left") (Variable "right"))
				(LinkSignature (Type 'LinkValue) (Variable "left") (Variable "right"))
				(IncrementValue
					(Anchor "mi-histogram")
					(LinkSignature (Type 'NumberNode)
						(Plus (Number 800)
							(Floor
								(Times (Number 20)
									(FloatValueOf (List (Variable "left") (Variable "right")) (Any "mi"))))))
					(Number 1)))
			(ValueOf (Anchor "analytics") (Predicate "pair generator")))))

; Pipeline to get histogram as table of (bin-index, count) pairs
; Returns LinkValue of (LinkValue bin-number count) for non-zero bins
(PipeLink (Name "get-mi-histogram")
	(Filter
		(Rule (Variable "$key")
			(Variable "$key")
			(LinkSignature (Type 'LinkValue)
				(Variable "$key")
				(FloatValueOf (Anchor "mi-histogram") (Variable "$key"))))
		(KeysOf (Anchor "mi-histogram"))))

; Master pipeline: run MI computation and build histogram
(PipeLink (Name "run-mi-histogram")
	(True
		(Name "run-mi")
		(Name "bin-mi")))

; ---------------------------------------------------------------
